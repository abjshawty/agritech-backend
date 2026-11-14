/**
 * Builds data/crops.json from the FAO ECOCROP database, using OpenCLIM's copy
 * of it (FAO no longer serves the original), pinned to one commit.
 *
 * From ECOCROP: optimal and absolute ranges for temperature (°C), rainfall
 * (mm over the growing period, as the standard ECOCROP model applies them;
 * see dismo's ecocrop.R) and pH, and the optimal soil texture.
 *
 * Not in ECOCROP, so set here and to be confirmed by the agronomy lead:
 * cycle length for annual crops (ECOCROP's ranges are too wide to use, e.g.
 * maize 65–365 days) and dry-season months for perennials.
 *
 * Run with `bun crops:build`. Commit the output.
 */
import type { Model } from "@/modules/crops/model";

const CSV =
  "https://raw.githubusercontent.com/openclim/ecocrop/f13577f4237604b15d85d8e43741714a2d1eb2d4/EcoCrop_DB.csv";

type local = {
  name: Model.entity["name"];
  species: string; // ECOCROP ScientificName, matched exactly
  kind: Model.entity["kind"];
  cycleMonths?: number;
  dryMonths?: Model.entity["dryMonths"];
};

const CROPS: Record<string, local> = {
  maize: {
    name: { fr: "Maïs", en: "Maize" },
    species: "Zea mays ssp. mays", // same ranges as "Zea mays", which has no texture
    kind: "annual",
    cycleMonths: 4,
  },
  rice: {
    name: { fr: "Riz pluvial", en: "Upland rice" },
    // ECOCROP's Oryza sativa is irrigated paddy (1500–2000 mm, waterlogged).
    species: "Oryza glaberrima",
    kind: "annual",
    cycleMonths: 4,
  },
  yam: {
    name: { fr: "Igname", en: "Yam" },
    species: "Dioscorea rotundata", // white yam, the main yam in Côte d'Ivoire
    kind: "annual",
    cycleMonths: 8,
  },
  cassava: {
    name: { fr: "Manioc", en: "Cassava" },
    species: "Manihot esculenta",
    kind: "annual",
    cycleMonths: 10,
  },
  groundnut: {
    name: { fr: "Arachide", en: "Groundnut" },
    species: "Arachis hypogaea",
    kind: "annual",
    cycleMonths: 4,
  },
  cotton: {
    name: { fr: "Coton", en: "Cotton" },
    species: "Gossypium hirsutum",
    kind: "annual",
    cycleMonths: 5,
  },
  cocoa: {
    name: { fr: "Cacao", en: "Cocoa" },
    species: "Theobroma cacao",
    kind: "perennial",
    dryMonths: { optimal: [0, 3], absolute: [0, 5] },
  },
  coffee: {
    name: { fr: "Café robusta", en: "Robusta coffee" },
    species: "Coffea canephora",
    kind: "perennial",
    dryMonths: { optimal: [0, 3], absolute: [0, 5] },
  },
  cashew: {
    name: { fr: "Anacarde", en: "Cashew" },
    species: "Anacardium occidentale",
    kind: "perennial",
    dryMonths: { optimal: [3, 6], absolute: [0, 8] },
  },
  oil_palm: {
    name: { fr: "Palmier à huile", en: "Oil palm" },
    species: "Elaeis guineensis",
    kind: "perennial",
    dryMonths: { optimal: [0, 2], absolute: [0, 4] },
  },
  rubber: {
    name: { fr: "Hévéa", en: "Rubber" },
    species: "Hevea brasiliensis",
    kind: "perennial",
    dryMonths: { optimal: [0, 2], absolute: [0, 4] },
  },
  plantain: {
    name: { fr: "Banane plantain", en: "Plantain" },
    species: "Musa acuminata x balbisiana", // plantains are this hybrid
    kind: "perennial",
    dryMonths: { optimal: [0, 2], absolute: [0, 4] },
  },
};

// ECOCROP's three texture classes onto our five. The in-between classes
// belong to both neighbours.
const TEXTURES: Record<string, Model.texture[]> = {
  light: ["sand", "sandy_loam"],
  medium: ["sandy_loam", "loam", "clay_loam"],
  heavy: ["clay_loam", "clay"],
  wide: ["sand", "sandy_loam", "loam", "clay_loam", "clay"],
};

/** Minimal CSV parsing: quoted fields may contain commas. */
const parse_line = (line: string) => {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
};

const response = await fetch(CSV);
if (!response.ok) throw new Error(`ECOCROP CSV: HTTP ${response.status}`);
// The file is Latin-1, not UTF-8.
const text = new TextDecoder("latin1").decode(await response.arrayBuffer());
const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
const columns = parse_line(header!);
const rows = lines.map((line) => {
  const values = parse_line(line);
  return Object.fromEntries(columns.map((c, i) => [c, values[i] ?? ""]));
});

const num = (row: Record<string, string>, column: string) => {
  const v = Number(row[column]);
  if (!Number.isFinite(v) || row[column] === "")
    throw new Error(`${row.ScientificName}: no ${column}`);
  return v;
};
const range = (row: Record<string, string>, lo: string, hi: string) =>
  [num(row, lo), num(row, hi)] as [number, number];

const out: (Model.entity & { source: string })[] = [];
for (const [id, crop] of Object.entries(CROPS)) {
  const row = rows.find((r) => r.ScientificName === crop.species);
  if (!row) throw new Error(`${crop.species} is not in ECOCROP`);

  const textures = [
    ...new Set(
      row
        .TEXT!.split(",")
        .map((t) => t.trim())
        .flatMap((t) => TEXTURES[t] ?? []),
    ),
  ];
  if (textures.length === 0)
    throw new Error(`${crop.species}: no usable texture in "${row.TEXT}"`);

  out.push({
    id,
    name: crop.name,
    kind: crop.kind,
    ...(crop.cycleMonths ? { cycleMonths: crop.cycleMonths } : {}),
    temp: {
      optimal: range(row, "TOPMN", "TOPMX"),
      absolute: range(row, "TMIN", "TMAX"),
    },
    rain: {
      optimal: range(row, "ROPMN", "ROPMX"),
      absolute: range(row, "RMIN", "RMAX"),
    },
    ph: {
      optimal: range(row, "PHOPMN", "PHOPMX"),
      absolute: range(row, "PHMIN", "PHMAX"),
    },
    ...(crop.dryMonths ? { dryMonths: crop.dryMonths } : {}),
    textures,
    source: `FAO ECOCROP: ${crop.species}`,
  });
  console.log(
    `${id.padEnd(9)} ${crop.species.padEnd(28)} rain ${row.ROPMN}–${row.ROPMX} mm, pH ${row.PHOPMN}–${row.PHOPMX}, ${textures.join("/")}`,
  );
}

await Bun.write("data/crops.json", JSON.stringify(out, null, 2) + "\n");
console.log("wrote data/crops.json");
