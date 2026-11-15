import { status } from "elysia";
import snapshots from "@/../data/snapshots.json";
import towns from "@/../data/towns.json";
import { DRY_MONTH_MM } from "@/lib/scorer";
import { fetch_climate, type climate } from "@/lib/power";
import { soil_at } from "@/lib/soil";
import { Model } from "./model";

/** The towns featured in the demo and in docs/gaez-comparison.md. */
export const DEMO_TOWNS = ["Abidjan", "Bouaké", "Korhogo", "San-Pédro", "Man"];
const SNAPSHOT_RADIUS_KM = 25;

const saved = snapshots as Record<string, climate>;

// Climate per 0.1° cell (about 11 km), kept for the life of the process.
const cache = new Map<string, climate>();
const cache_key = (lat: number, lon: number) =>
  `${lat.toFixed(1)},${lon.toFixed(1)}`;

export const distance_km = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const nearest = (point: { lat: number; lon: number }, among = towns) =>
  among.reduce((best, town) =>
    distance_km(point, town) < distance_km(point, best) ? town : best,
  );

const climate_for = async (
  lat: number,
  lon: number,
): Promise<{ climate: climate; source: Model.source }> => {
  const key = cache_key(lat, lon);
  const cached = cache.get(key);
  if (cached) return { climate: cached, source: "cache" };

  try {
    const climate = await fetch_climate(lat, lon);
    cache.set(key, climate);
    return { climate, source: "live" };
  } catch (error) {
    console.warn(`NASA POWER failed for ${key}:`, error);
    const demo = nearest(
      { lat, lon },
      towns.filter((t) => t.name in saved),
    );
    if (distance_km({ lat, lon }, demo) <= SNAPSHOT_RADIUS_KM)
      return { climate: saved[demo.name]!, source: "snapshot" };
    throw status(503, Model.climate_unavailable.const);
  }
};

export const get_site = async (lat: number, lon: number) => {
  // Soil is local, so check it first and don't spend a NASA call on the sea.
  const soil = soil_at(lat, lon);
  if (!soil) throw status(400, Model.no_soil.const);

  const { climate, source } = await climate_for(lat, lon);
  const site: Model.site = {
    lat,
    lon,
    nearestTown: nearest({ lat, lon }).name,
    climate: {
      rain: climate.rain,
      tmean: climate.tmean,
      wetness: climate.wetness,
      annualRain: Math.round(climate.rain.reduce((a, b) => a + b, 0)),
      dryMonths: climate.rain.filter((mm) => mm < DRY_MONTH_MM).length,
    },
    soil,
    shift: climate.shift,
  };
  return { site, source };
};
