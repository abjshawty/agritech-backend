/**
 * Monthly climate and root-zone soil wetness from NASA POWER (https://power.larc.nasa.gov), agroclimatology
 * community. One call covers 1984–2023: the recent decade feeds the scoring and
 * the first decade is the baseline for the Field Shift comparison.
 */

export const RECENT = [2014, 2023] as const;
export const BASELINE = [1984, 1993] as const;

export const TIMEOUT_MS = 8000;

export type climate = {
  rain: number[]; // mm per month, January first, mean over RECENT
  tmean: number[]; // °C per month, January first, mean over RECENT
  wetness: number[]; // root-zone soil wetness per month, 0 (dry) to 1 (saturated), mean over RECENT
  shift: { rainPct: number; tempDelta: number; wetnessDelta: number }; // RECENT vs BASELINE
};

type power_response = {
  properties: {
    parameter: {
      PRECTOTCORR_SUM: Record<string, number>; // monthly total in mm, despite the "mm/day" label
      T2M: Record<string, number>;
      GWETROOT: Record<string, number>;
    };
  };
  header: { fill_value: number };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mean per calendar month over [from, to], skipping fill values. */
const monthly_means = (
  series: Record<string, number>,
  [from, to]: readonly [number, number],
  fill: number,
) =>
  Array.from({ length: 12 }, (_, m) => {
    const values: number[] = [];
    for (let year = from; year <= to; year++) {
      const v = series[`${year}${String(m + 1).padStart(2, "0")}`];
      if (v != null && v !== fill) values.push(v);
    }
    if (values.length === 0)
      throw new Error(`NASA POWER has no data for month ${m + 1}`);
    return values.reduce((a, b) => a + b, 0) / values.length;
  });

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

export const fetch_climate = async (
  lat: number,
  lon: number,
): Promise<climate> => {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/monthly/point");
  url.search = new URLSearchParams({
    parameters: "PRECTOTCORR_SUM,T2M,GWETROOT",
    community: "AG",
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start: String(BASELINE[0]),
    end: String(RECENT[1]),
    format: "JSON",
  }).toString();

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`NASA POWER: HTTP ${response.status}`);
  const body = (await response.json()) as power_response;
  const {
    PRECTOTCORR_SUM: rain,
    T2M: temp,
    GWETROOT: wet,
  } = body.properties.parameter;
  const fill = body.header.fill_value;

  const recent_rain = monthly_means(rain, RECENT, fill);
  const recent_temp = monthly_means(temp, RECENT, fill);
  const base_rain = monthly_means(rain, BASELINE, fill);
  const base_temp = monthly_means(temp, BASELINE, fill);
  const recent_wet = monthly_means(wet, RECENT, fill);
  const base_wet = monthly_means(wet, BASELINE, fill);

  return {
    rain: recent_rain.map(round1),
    tmean: recent_temp.map(round1),
    wetness: recent_wet.map(round2),
    shift: {
      rainPct: round1(
        ((sum(recent_rain) - sum(base_rain)) / sum(base_rain)) * 100,
      ),
      tempDelta: round1(mean(recent_temp) - mean(base_temp)),
      wetnessDelta: round2(mean(recent_wet) - mean(base_wet)),
    },
  };
};
