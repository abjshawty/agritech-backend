/**
 * Builds data/snapshots.json: NASA POWER climate for the demo towns, served by
 * the API when POWER can't be reached so the live demo keeps working.
 *
 * Run with `bun snapshots:build`. Commit the output.
 */
import towns from "@/../data/towns.json";
import { fetch_climate, type climate } from "@/lib/power";
import { DEMO_TOWNS } from "@/modules/recommend/site";

const out: Record<string, climate> = {};
for (const name of DEMO_TOWNS) {
  const town = towns.find((t) => t.name === name);
  if (!town) throw new Error(`${name} is not in data/towns.json`);
  out[name] = await fetch_climate(town.lat, town.lon);
  const annual = Math.round(out[name].rain.reduce((a, b) => a + b, 0));
  console.log(
    `${name}: ${annual} mm/yr, rain ${out[name].shift.rainPct}%, ${out[name].shift.tempDelta} °C`,
  );
}
await Bun.write("data/snapshots.json", JSON.stringify(out, null, 2) + "\n");
console.log("wrote data/snapshots.json");
