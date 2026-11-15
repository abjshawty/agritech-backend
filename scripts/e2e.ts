/**
 * End-to-end check of a running API over HTTP.
 *
 *   bun e2e                          # http://localhost:3000/api
 *   bun e2e https://agritech.example/api
 *
 * Calls NASA POWER through the server for every town, so it takes about a
 * minute against a cold cache. Exits 1 if any check fails.
 */
import towns from "@/../data/towns.json";

const BASE = (process.argv[2] ?? "http://localhost:3000/api").replace(
  /\/$/,
  "",
);

let failed = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
};

const get = async (path: string, init?: RequestInit) => {
  const t0 = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...init,
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    body,
    ms: Math.round(performance.now() - t0),
    response,
  };
};

const rec = (q: string) => get(`/recommend?${q}`);

// Stop early with a fix rather than a wall of failures when the URL is wrong.
{
  const probe = await get("/crops").catch(() => null);
  if (!probe || !Array.isArray(probe.body)) {
    const origin = new URL(BASE).origin;
    console.error(
      `No AGRITECH API at ${BASE} (/crops gave ${probe ? probe.status : "no response"}).\n` +
        `The base URL must include the server's SERVER_PATH. A server started without a .env\n` +
        `serves at the root, so try: bun e2e ${origin}`,
    );
    process.exit(1);
  }
}

// --- Docs ---------------------------------------------------------------
{
  const root = await get("/");
  check(root.status === 302, "root redirects to the docs", `${root.status}`);
  const spec = await get("/docs/json");
  check(
    spec.status === 200 &&
      typeof spec.body === "object" &&
      "paths" in spec.body,
    "OpenAPI spec is served",
  );
}

// --- Crops --------------------------------------------------------------
const crops = await get("/crops");
{
  check(
    crops.status === 200 && crops.body.length === 12,
    "12 crop profiles",
    `${crops.body.length}`,
  );
  const inside = (o: number[], a: number[]) =>
    a[0]! <= o[0]! && o[1]! <= a[1]! && o[0]! <= o[1]!;
  const bad = crops.body.filter(
    (c: any) =>
      !c.source?.startsWith("FAO ECOCROP") ||
      !inside(c.temp.optimal, c.temp.absolute) ||
      !inside(c.rain.optimal, c.rain.absolute) ||
      !inside(c.ph.optimal, c.ph.absolute) ||
      (c.kind === "annual") !== (c.cycleMonths != null) ||
      (c.kind === "perennial") !== (c.dryMonths != null) ||
      c.textures.length === 0,
  );
  check(
    bad.length === 0,
    "every profile is sourced and internally consistent",
    bad.map((c: any) => c.id).join(", "),
  );
}

// --- Every town -----------------------------------------------------------
const verdict_for = (s: number) =>
  s >= 70 ? "good" : s >= 40 ? "possible" : "poor";
const no_gaez = new Set(["cashew", "rubber"]);
const times: number[] = [];
const problems: string[] = [];
const fallbacks: string[] = [];
for (const town of towns) {
  const r = await rec(`lat=${town.lat}&lon=${town.lon}`);
  times.push(r.ms);
  const b = r.body;
  const why: string[] = [];
  if (r.status !== 200) why.push(`status ${r.status}`);
  else {
    if (b.site.nearestTown !== town.name)
      why.push(`nearestTown ${b.site.nearestTown}`);
    for (const k of ["rain", "tmean", "wetness"])
      if (b.site.climate[k].length !== 12) why.push(`${k} length`);
    if (b.results.length !== 12) why.push(`${b.results.length} results`);
    if (
      b.results.some(
        (x: any, i: number) => i > 0 && x.score > b.results[i - 1].score,
      )
    )
      why.push("not sorted");
    for (const x of b.results) {
      if (x.verdict !== verdict_for(x.score)) why.push(`${x.cropId} verdict`);
      if ((x.gaez == null) !== no_gaez.has(x.cropId))
        why.push(`${x.cropId} gaez ${x.gaez}`);
      if (!(x.moisture >= 0 && x.moisture <= 1))
        why.push(`${x.cropId} moisture`);
      if (x.factors.some((f: any) => !(f.score >= 0 && f.score <= 1)))
        why.push(`${x.cropId} factor score`);
      if (x.reasons.length === 0) why.push(`${x.cropId} no reasons`);
    }
    if (b.source === "snapshot") fallbacks.push(town.name);
    else if (!["live", "cache"].includes(b.source))
      why.push(`source ${b.source}`);
  }
  if (why.length) problems.push(`${town.name}: ${why.join(", ")}`);
}
check(
  problems.length === 0,
  `all ${towns.length} towns return a complete, consistent ranking`,
  problems.join("; "),
);
times.sort((a, b) => a - b);
if (fallbacks.length)
  console.log(
    `  NASA POWER was slow or down for ${fallbacks.length}; served saved climate: ${fallbacks.join(", ")}`,
  );
console.log(
  `  response times: median ${times[times.length >> 1]} ms, max ${times.at(-1)} ms`,
);

// --- Cache ----------------------------------------------------------------
{
  const again = await rec("lat=9.46&lon=-5.63");
  // Saved climate isn't cached, so the check only means something when POWER answered.
  if (again.body.source === "snapshot")
    console.log("- cache check skipped (NASA POWER unavailable)");
  else
    check(
      again.body.source === "cache" && again.ms < 200,
      "a repeat request is served from the cache",
      `${again.body.source}, ${again.ms} ms`,
    );
}

// --- Planting month and irrigation ---------------------------------------
{
  const months = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      rec(`lat=7.69&lon=-5.03&plantingMonth=${i + 1}`),
    ),
  );
  check(
    months.every((m, i) => m.status === 200 && m.body.plantingMonth === i + 1),
    "every planting month 1–12 is accepted and echoed",
  );
  const maize = months.map(
    (m) => m.body.results.find((x: any) => x.cropId === "maize").score,
  );
  check(
    new Set(maize).size > 1,
    "planting month changes annual-crop scores",
    `maize by month: ${maize.join(" ")}`,
  );
  const cocoa = months.map(
    (m) => m.body.results.find((x: any) => x.cropId === "cocoa").score,
  );
  check(
    new Set(cocoa).size === 1,
    "planting month doesn't change perennial scores",
  );

  const dry = await rec("lat=9.46&lon=-5.63&plantingMonth=11");
  const wet = await rec("lat=9.46&lon=-5.63&plantingMonth=11&irrigated=true");
  const d = dry.body.results.find((x: any) => x.cropId === "maize");
  const w = wet.body.results.find((x: any) => x.cropId === "maize");
  check(
    wet.body.irrigated === true &&
      w.score > d.score &&
      w.waterDeficitMm === d.waterDeficitMm &&
      d.waterDeficitMm > 0,
    "irrigation lifts a dry-season score and keeps the deficit",
    `maize ${d.score} → ${w.score}, deficit ${d.waterDeficitMm} mm`,
  );
  check(
    w.reasons.some((x: any) => x.key === "water.irrigate"),
    "irrigated result explains the irrigation to plan",
  );
}

// --- Errors ---------------------------------------------------------------
for (const [label, q, expected] of [
  ["a point at sea", "lat=4.4&lon=-4.0", 400],
  ["latitude north of Côte d'Ivoire", "lat=12&lon=-5", 422],
  ["longitude east of Côte d'Ivoire", "lat=7&lon=-1", 422],
  ["planting month 0", "lat=7.69&lon=-5.03&plantingMonth=0", 422],
  ["planting month 13", "lat=7.69&lon=-5.03&plantingMonth=13", 422],
  ["a non-numeric latitude", "lat=abc&lon=-5", 422],
  ["a missing longitude", "lat=7", 422],
] as const) {
  const r = await rec(q);
  check(r.status === expected, `${label} is a ${expected}`, `${r.status}`);
}
{
  const r = await rec("lat=4.4&lon=-4.0");
  check(
    typeof r.body === "string" && r.body.includes("land"),
    "the sea error tells the user what to do",
    JSON.stringify(r.body),
  );
  const missing = await get("/nope");
  check(missing.status === 404, "an unknown route is a 404");
}

// --- Concurrency ------------------------------------------------------------
{
  const t0 = performance.now();
  const all = await Promise.all(
    towns
      .slice(0, 20)
      .map((t) => rec(`lat=${t.lat + 0.03}&lon=${t.lon + 0.03}`)),
  );
  check(
    all.every((r) => r.status === 200),
    "20 parallel requests all succeed",
    `${Math.round(performance.now() - t0)} ms total`,
  );
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
