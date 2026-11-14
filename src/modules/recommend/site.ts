import type { Model } from "./model";

/**
 * MOCK. Every request gets this Bouaké sample until the NASA POWER and
 * SoilGrids fetchers replace it. The numbers are plausible for Bouaké but
 * were not fetched; don't quote them.
 */
export const sample_site = (lat: number, lon: number): Model.site => {
  const rain = [10, 35, 90, 130, 140, 140, 90, 110, 170, 110, 30, 15];
  return {
    lat,
    lon,
    nearestTown: "Bouaké",
    climate: {
      rain,
      tmean: [26.5, 28, 28.5, 28, 27, 26, 25, 25, 25.5, 26, 26.5, 26],
      annualRain: rain.reduce((a, b) => a + b, 0),
      dryMonths: rain.filter((mm) => mm < 50).length,
    },
    soil: { ph: 5.8, sand: 45, clay: 20, soc: 1.2, texture: "loam" },
    shift: { rainPct: -8.2, tempDelta: 0.6 },
  };
};
