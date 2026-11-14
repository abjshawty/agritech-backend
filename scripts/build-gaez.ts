/**
 * Builds data/gaez-grid.json: FAO GAEZ v4 crop suitability for Côte d'Ivoire,
 * shown beside our own score as an independent second opinion.
 *
 * Layers: suitability index (0–10000) for all land in each 5-arc-minute cell,
 * under 1981–2010 climate, rain-fed, low input level (the smallholder case).
 * GAEZ has no cashew or rubber; banana stands in for plantain.
 *
 * Run with `bun gaez:build`. Commit the output.
 */
import { fromArrayBuffer } from "geotiff";
import { Model } from "@/modules/recommend/model";

const SERVICE =
  "https://gaez-services.fao.org/server/rest/services/res05/ImageServer";

// Our crop id → GAEZ layer name.
const LAYERS: Record<string, string> = {
  maize: "sxLr_mze",
  rice: "sxLr_rcd", // dryland rice
  yam: "sxLr_yam",
  cassava: "sxLr_csv",
  groundnut: "sxLr_grd",
  cotton: "sxLr_cot",
  cocoa: "sxLr_coc",
  coffee: "sxLr_cof",
  oil_palm: "sxLr_olp",
  plantain: "sxLr_ban", // banana
};

const STEP = 1 / 12; // GAEZ's native 5 arc-minutes
const [LAT_MIN, LAT_MAX] = Model.bounds.lat;
const [LON_MIN, LON_MAX] = Model.bounds.lon;
const COLS = Math.round((LON_MAX - LON_MIN) / STEP);
const ROWS = Math.round((LAT_MAX - LAT_MIN) / STEP);

const raster_id = async (name: string) => {
  const url = new URL(`${SERVICE}/query`);
  url.search = new URLSearchParams({
    where: `name = '${name}' AND year = '1981-2010' AND water_supply = 'Rainfed' AND input_level = 'Low'`,
    outFields: "objectid",
    returnGeometry: "false",
    f: "json",
  }).toString();
  const body = (await (await fetch(url)).json()) as {
    features?: { attributes: { objectid: number } }[];
  };
  const id = body.features?.[0]?.attributes.objectid;
  if (id == null) throw new Error(`GAEZ layer ${name} not found`);
  return id;
};

const fetch_layer = async (name: string) => {
  const url = new URL(`${SERVICE}/exportImage`);
  url.search = new URLSearchParams({
    bbox: `${LON_MIN},${LAT_MIN},${LON_MAX},${LAT_MAX}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${COLS},${ROWS}`,
    format: "tiff",
    pixelType: "S16",
    interpolation: "RSP_NearestNeighbor",
    mosaicRule: JSON.stringify({
      mosaicMethod: "esriMosaicLockRaster",
      lockRasterIds: [await raster_id(name)],
    }),
    f: "image",
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const image = await (
    await fromArrayBuffer(await response.arrayBuffer())
  ).getImage();
  const [band] = (await image.readRasters()) as unknown as ArrayLike<number>[];
  return {
    bbox: image.getBoundingBox(),
    width: image.getWidth(),
    height: image.getHeight(),
    band: band!,
  };
};

let grid: { lat0: number; lon0: number; rows: number; cols: number } | null =
  null;
const crops: Record<string, (number | null)[]> = {};

for (const [crop, name] of Object.entries(LAYERS)) {
  const { bbox, width, height, band } = await fetch_layer(name);
  const [west, south] = bbox;
  // The server snaps the box to its own cells; every layer must agree.
  if (!grid) grid = { lat0: south!, lon0: west!, rows: height, cols: width };
  else if (grid.rows !== height || grid.cols !== width || grid.lat0 !== south)
    throw new Error(`${name} came back on a different grid`);

  // Rows come north first; flip so row 0 is the southern edge. Negative
  // values are GAEZ's no-data codes.
  const values: (number | null)[] = [];
  for (let row = height - 1; row >= 0; row--)
    for (let col = 0; col < width; col++) {
      const v = band[row * width + col]!;
      values.push(v < 0 ? null : Math.round(v / 100));
    }
  crops[crop] = values;
  console.log(
    `${crop} (${name}): ${values.filter((v) => v != null && v > 0).length} cells above 0`,
  );
}

await Bun.write(
  "data/gaez-grid.json",
  JSON.stringify({
    source:
      "FAO GAEZ v4 suitability index, 1981–2010, rain-fed, low input, all land; 0–100",
    ...grid,
    step: STEP,
    crops,
  }),
);
console.log(`wrote data/gaez-grid.json (${grid!.rows}×${grid!.cols})`);
