import grid from "@/../data/soil-grid.json";
import type { Model as Crops } from "@/modules/crops/model";
import { texture_class } from "./scorer";

/** Topsoil (0–30 cm) from the prebuilt SoilGrids grid; see scripts/build-soil.ts. */
export type soil = {
  ph: number;
  sand: number;
  clay: number;
  soc: number;
  texture: Crops.texture;
};

type layer = (number | null)[];
const { lat0, lon0, step, rows, cols } = grid;
const layers = grid as unknown as Record<"ph" | "sand" | "clay" | "soc", layer>;

/** How far to look for a mapped cell when the nearest one is water or unmapped. */
const SEARCH_CELLS = 3;

const cell = (row: number, col: number): soil | null => {
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  const i = row * cols + col;
  const ph = layers.ph[i];
  const sand = layers.sand[i];
  const clay = layers.clay[i];
  const soc = layers.soc[i];
  if (ph == null || sand == null || clay == null || soc == null) return null;
  return { ph, sand, clay, soc, texture: texture_class(sand, clay) };
};

/**
 * Soil at the nearest mapped cell, searching outward up to SEARCH_CELLS
 * (about 15 km) so a pin on a lagoon or river still gets the land beside it.
 * Null when nothing is mapped that close.
 */
export const soil_at = (lat: number, lon: number): soil | null => {
  // lat0/lon0 are the grid's south-west corner, so floor finds the containing cell.
  const row = Math.floor((lat - lat0) / step);
  const col = Math.floor((lon - lon0) / step);
  for (let r = 0; r <= SEARCH_CELLS; r++)
    for (let dr = -r; dr <= r; dr++)
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue; // ring only
        const found = cell(row + dr, col + dc);
        if (found) return found;
      }
  return null;
};
