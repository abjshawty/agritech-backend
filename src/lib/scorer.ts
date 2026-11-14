import type { Model as Crops } from "@/modules/crops/model";

/** What the scorer needs to know about a location. Months are indexed 0–11. */
export type site = {
  rain: number[]; // mm per month
  tmean: number[]; // °C per month
  ph: number;
  texture: Crops.texture;
};

export type factor_key = "rain" | "temp" | "ph" | "texture" | "dryMonths";

export type factor = {
  key: factor_key;
  value: number | string;
  optimal: [number, number] | null; // null for texture, which is categorical
  absolute: [number, number] | null;
  score: number;
};

export type reason = {
  key: string;
  params: Record<string, number | string>;
};

export type verdict = "good" | "possible" | "poor";

export type result = {
  cropId: string;
  kind: Crops.entity["kind"];
  score: number;
  verdict: verdict;
  waterDeficitMm: number;
  factors: factor[];
  reasons: reason[];
};

/** A month counts as dry below this much rain. */
export const DRY_MONTH_MM = 50;

/** Score given to a soil texture the crop isn't listed for: poor, not fatal. */
export const UNSUITED_TEXTURE = 0.4;

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** 1 inside the optimal range, falling linearly to 0 at the absolute limit. */
export const trapezoid = (
  value: number,
  [opt_min, opt_max]: [number, number],
  [abs_min, abs_max]: [number, number],
) => {
  if (value >= opt_min && value <= opt_max) return 1;
  if (value <= abs_min || value >= abs_max) return 0;
  return value < opt_min
    ? (value - abs_min) / (opt_min - abs_min)
    : (abs_max - value) / (abs_max - opt_max);
};

export const dry_months = (rain: number[]) =>
  rain.filter((mm) => mm < DRY_MONTH_MM).length;

/** Month indexes (0–11) covered by a cycle starting at `planting` (1–12). */
export const cycle_months = (planting: number, length: number) =>
  Array.from({ length }, (_, i) => (planting - 1 + i) % 12);

/**
 * Next rainy-season onset after `from` (1–12), as a month 1–12: the first
 * month with at least 100 mm whose previous month had less.
 * Falls back to the wettest month when every month is wet or dry.
 */
export const next_onset = (rain: number[], from: number) => {
  for (let i = 1; i <= 12; i++) {
    const m = (from - 1 + i) % 12;
    const prev = (m + 11) % 12;
    if (rain[m]! >= 100 && rain[prev]! < 100) return m + 1;
  }
  return rain.indexOf(Math.max(...rain)) + 1;
};

export const verdict_for = (score: number): verdict =>
  score >= 70 ? "good" : score >= 40 ? "possible" : "poor";

const range_reason = (f: factor): reason => {
  const [min, max] = f.optimal!;
  const value = f.value as number;
  const state = value < min ? "tooLow" : value > max ? "tooHigh" : "ok";
  return { key: `${f.key}.${state}`, params: { value, min, max } };
};

const reason_for = (f: factor): reason =>
  f.key === "texture"
    ? {
        key: f.score === 1 ? "texture.ok" : "texture.unsuited",
        params: { texture: f.value },
      }
    : range_reason(f);

/** Score one crop at one site. Pure: same inputs, same result. */
export const score = (
  crop: Crops.entity,
  site: site,
  planting: number,
  irrigated: boolean,
): result => {
  const months =
    crop.kind === "annual"
      ? cycle_months(planting, crop.cycleMonths ?? 4)
      : cycle_months(1, 12);

  const rain = round(months.reduce((sum, m) => sum + site.rain[m]!, 0));
  const temp = round(
    months.reduce((sum, m) => sum + site.tmean[m]!, 0) / months.length,
    1,
  );

  const water_deficit = Math.max(0, round(crop.rain.optimal[0] - rain));

  // Irrigation covers a shortfall, not an excess.
  const rain_score =
    irrigated && rain < crop.rain.optimal[0]
      ? 1
      : trapezoid(rain, crop.rain.optimal, crop.rain.absolute);

  const factors: factor[] = [
    {
      key: "rain",
      value: rain,
      optimal: crop.rain.optimal,
      absolute: crop.rain.absolute,
      score: rain_score,
    },
    {
      key: "temp",
      value: temp,
      optimal: crop.temp.optimal,
      absolute: crop.temp.absolute,
      score: trapezoid(temp, crop.temp.optimal, crop.temp.absolute),
    },
    {
      key: "ph",
      value: site.ph,
      optimal: crop.ph.optimal,
      absolute: crop.ph.absolute,
      score: trapezoid(site.ph, crop.ph.optimal, crop.ph.absolute),
    },
    {
      key: "texture",
      value: site.texture,
      optimal: null,
      absolute: null,
      score: crop.textures.includes(site.texture) ? 1 : UNSUITED_TEXTURE,
    },
  ];

  if (crop.kind === "perennial" && crop.dryMonths) {
    const dry = dry_months(site.rain);
    factors.push({
      key: "dryMonths",
      value: dry,
      optimal: crop.dryMonths.optimal,
      absolute: crop.dryMonths.absolute,
      score: trapezoid(dry, crop.dryMonths.optimal, crop.dryMonths.absolute),
    });
  }

  for (const f of factors) f.score = round(f.score, 2);

  // Geometric mean: one weak factor drags the whole score down; a zero kills it.
  const total = factors.some((f) => f.score === 0)
    ? 0
    : round(
        100 *
          Math.exp(
            factors.reduce((sum, f) => sum + Math.log(f.score), 0) /
              factors.length,
          ),
      );

  // Weakest factor first, then the strongest when it's a different one.
  const sorted = [...factors].sort((a, b) => a.score - b.score);
  const reasons = [reason_for(sorted[0]!)];
  const best = sorted.at(-1)!;
  if (best !== sorted[0] && best.score > sorted[0]!.score)
    reasons.push(reason_for(best));
  if (irrigated && water_deficit > 0)
    reasons.push({ key: "water.irrigate", params: { mm: water_deficit } });

  return {
    cropId: crop.id,
    kind: crop.kind,
    score: total,
    verdict: verdict_for(total),
    waterDeficitMm: water_deficit,
    factors,
    reasons,
  };
};

/** Simplified texture class from SoilGrids sand and clay percentages. */
export const texture_class = (sand: number, clay: number): Crops.texture => {
  if (clay >= 40) return "clay";
  if (sand >= 85) return "sand";
  if (sand >= 52 && clay < 20) return "sandy_loam";
  if (clay >= 27) return "clay_loam";
  return "loam";
};
