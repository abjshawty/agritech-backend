/**
 * Builds data/snapshots.json: NASA POWER climate for every town in the picker,
 * served by the API when POWER fails or is slow, so any town a user picks
 * (and anywhere within 25 km of one) keeps working.
 *
 * Run with `bun snapshots:build`. Commit the output.
 */
import towns from "@/../data/towns.json";
import { fetch_climate, type climate } from "@/lib/power";

// POWER is sometimes slower than the API's 5 s timeout; a build can afford to retry.
const ATTEMPTS = 3;

const fetch_with_retry = async (lat: number, lon: number) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch_climate(lat, lon);
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      console.warn(`  retrying (${attempt}/${ATTEMPTS - 1}): ${error}`);
    }
  }
};

const out: Record<string, climate> = {};
for (const town of towns) {
  out[town.name] = await fetch_with_retry(town.lat, town.lon);
  const c = out[town.name]!;
  const annual = Math.round(c.rain.reduce((a, b) => a + b, 0));
  console.log(
    `${town.name}: ${annual} mm/yr, rain ${c.shift.rainPct}%, ${c.shift.tempDelta} °C`,
  );
}
await Bun.write("data/snapshots.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote data/snapshots.json (${towns.length} towns)`);
