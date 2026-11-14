/**
 * Builds data/soil-grid.json: SoilGrids topsoil (0–30 cm) for Côte d'Ivoire on
 * a 0.05° grid, so the API looks soil up locally. SoilGrids' point API is too
 * slow and too often empty to call per request, and is limited to about 5
 * calls a minute; its coverage service serves the same maps in under a second.
 *
 * Run with `bun soil:build`. Commit the output.
 */
import { fromArrayBuffer } from "geotiff";
import { Model } from "@/modules/recommend/model";

const STEP = 0.05;
const [LAT_MIN, LAT_MAX] = Model.bounds.lat;
const [LON_MIN, LON_MAX] = Model.bounds.lon;
const COLS = Math.round((LON_MAX - LON_MIN) / STEP);
const ROWS = Math.round((LAT_MAX - LAT_MIN) / STEP);

// Thickness of each SoilGrids layer, used to weight the 0–30 cm average.
const DEPTHS = [
  ["0-5cm", 5],
  ["5-15cm", 10],
  ["15-30cm", 15],
] as const;

// SoilGrids stores integers: pH×10, g/kg for sand and clay, dg/kg for SOC.
// Each divisor converts to pH, %, % and % respectively.
const PROPERTIES = { phh2o: 10, sand: 10, clay: 10, soc: 100 } as const;
type property = keyof typeof PROPERTIES;

const fetch_layer = async (property: property, depth: string) => {
  const url = new URL("https://maps.isric.org/mapserv");
  url.search = new URLSearchParams([
    ["map", `/map/${property}.map`],
    ["SERVICE", "WCS"],
    ["VERSION", "2.0.1"],
    ["REQUEST", "GetCoverage"],
    ["COVERAGEID", `${property}_${depth}_mean`],
    ["FORMAT", "image/tiff"],
    ["SUBSET", `long(${LON_MIN},${LON_MAX})`],
    ["SUBSET", `lat(${LAT_MIN},${LAT_MAX})`],
    ["SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"],
    ["OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"],
    ["SCALESIZE", `long(${COLS}),lat(${ROWS})`],
  ]).toString();

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${property} ${depth}: HTTP ${response.status}`);
  const tiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  if (image.getWidth() !== COLS || image.getHeight() !== ROWS)
    throw new Error(
      `${property} ${depth}: got ${image.getWidth()}×${image.getHeight()}, wanted ${COLS}×${ROWS}`,
    );
  const nodata = image.getGDALNoData();
  const [band] = (await image.readRasters()) as unknown as ArrayLike<number>[];
  // Rows come north first; flip so row 0 is LAT_MIN like the lookup expects.
  const values: (number | null)[] = [];
  for (let row = ROWS - 1; row >= 0; row--)
    for (let col = 0; col < COLS; col++) {
      const v = band![row * COLS + col]!;
      // 0 is water or unmapped in SoilGrids; no real topsoil has pH 0 or 0% of everything.
      values.push(v === nodata || v <= 0 ? null : v);
    }
  return values;
};

const layers = {} as Record<property, (number | null)[]>;
for (const property of Object.keys(PROPERTIES) as property[]) {
  const by_depth = await Promise.all(
    DEPTHS.map(([depth]) => fetch_layer(property, depth)),
  );
  const total = DEPTHS.reduce((sum, [, cm]) => sum + cm, 0);
  layers[property] = by_depth[0]!.map((_, i) => {
    if (by_depth.some((d) => d[i] == null)) return null;
    const mean =
      DEPTHS.reduce((sum, [, cm], d) => sum + by_depth[d]![i]! * cm, 0) / total;
    return Math.round((mean / PROPERTIES[property]) * 10) / 10;
  });
  const filled = layers[property].filter((v) => v != null).length;
  console.log(`${property}: ${filled}/${ROWS * COLS} cells with data`);
}

const out = {
  source: "SoilGrids 2.0 (ISRIC), mean 0–30 cm, resampled to 0.05°",
  lat0: LAT_MIN,
  lon0: LON_MIN,
  step: STEP,
  rows: ROWS,
  cols: COLS,
  ph: layers.phh2o,
  sand: layers.sand,
  clay: layers.clay,
  soc: layers.soc,
};
await Bun.write("data/soil-grid.json", JSON.stringify(out));
console.log(`wrote data/soil-grid.json (${ROWS}×${COLS})`);
