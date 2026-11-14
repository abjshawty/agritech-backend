import grid from "@/../data/gaez-grid.json";

/** FAO GAEZ suitability from the prebuilt grid; see scripts/build-gaez.ts. */
const { lat0, lon0, step, rows, cols } = grid;
const crops = grid.crops as Record<string, (number | null)[]>;

/**
 * GAEZ suitability (0–100) for a crop at a point, or null when GAEZ doesn't
 * cover the crop (cashew, rubber) or the point.
 */
export const gaez_at = (crop: string, lat: number, lon: number) => {
  const layer = crops[crop];
  // lat0/lon0 are the grid's south-west corner, so floor finds the containing cell.
  const row = Math.floor((lat - lat0) / step);
  const col = Math.floor((lon - lon0) / step);
  if (!layer || row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return layer[row * cols + col] ?? null;
};
