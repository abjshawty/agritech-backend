import { describe, expect, test } from "bun:test";
import { Service as Crops } from "@/modules/crops/service";
import {
  cycle_months,
  next_onset,
  score,
  texture_class,
  trapezoid,
  type site,
} from "./scorer";

const crop = (id: string) => Crops.list().find((c) => c.id === id)!;

// Illustrative sites, not fetched data: a savanna north and a wet forest south.
const north: site = {
  rain: [5, 10, 30, 70, 120, 150, 220, 280, 200, 70, 10, 5],
  tmean: [26, 28, 31, 31, 29, 27, 26, 25, 26, 27, 27, 25],
  ph: 6.2,
  texture: "sandy_loam",
};
const south: site = {
  rain: [40, 60, 110, 160, 300, 450, 160, 50, 80, 170, 150, 80],
  tmean: [27, 28, 28, 28, 27, 26, 25, 25, 25, 26, 27, 27],
  ph: 6.2,
  texture: "loam",
};

describe("trapezoid", () => {
  test.each([
    [25, 1], // inside optimal
    [20, 1], // optimal edge
    [15, 0.5], // halfway down the low side
    [10, 0], // absolute limit
    [5, 0], // beyond it
    [35, 0.5], // halfway down the high side
  ])("value %d scores %d", (value, expected) => {
    expect(trapezoid(value, [20, 30], [10, 40])).toBeCloseTo(expected);
  });
});

describe("months", () => {
  test("a cycle wraps around the year", () => {
    expect(cycle_months(11, 4)).toEqual([10, 11, 0, 1]);
  });
  test("onset in the south after December is the long rains in March", () => {
    expect(next_onset(south.rain, 12)).toBe(3);
  });
  test("onset after July in the south is the short rains in October", () => {
    expect(next_onset(south.rain, 7)).toBe(10);
  });
  test("onset in the north is May", () => {
    expect(next_onset(north.rain, 1)).toBe(5);
  });
});

describe("score", () => {
  test("cocoa in the north is unsuitable: the dry season is too long", () => {
    const r = score(crop("cocoa"), north, 1, false);
    expect(r.verdict).toBe("poor");
    expect(r.reasons[0]!.key).toBe("dryMonths.tooHigh");
  });

  test("cocoa in the south is good", () => {
    expect(score(crop("cocoa"), south, 1, false).verdict).toBe("good");
  });

  test("cashew prefers the north's long dry season to the south's", () => {
    expect(score(crop("cashew"), north, 1, false).score).toBeGreaterThan(
      score(crop("cashew"), south, 1, false).score,
    );
  });

  test("maize planted at the northern onset is good", () => {
    expect(score(crop("maize"), north, 5, false).verdict).toBe("good");
  });

  test("planting maize in the dry season shows a deficit and scores poor", () => {
    const r = score(crop("maize"), north, 11, false);
    expect(r.verdict).toBe("poor");
    expect(r.waterDeficitMm).toBeGreaterThan(0);
  });

  test("irrigation covers the deficit but keeps it visible", () => {
    const dry = score(crop("maize"), north, 11, false);
    const wet = score(crop("maize"), north, 11, true);
    expect(wet.score).toBeGreaterThan(dry.score);
    expect(wet.waterDeficitMm).toBe(dry.waterDeficitMm);
    expect(wet.reasons.map((r) => r.key)).toContain("water.irrigate");
  });

  test("an unsuited texture lowers the score without zeroing it", () => {
    const r = score(crop("yam"), { ...south, texture: "sand" }, 3, false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.factors.find((f) => f.key === "texture")!.score).toBe(0.4);
  });
});

describe("texture_class", () => {
  test.each([
    [20, 45, "clay"],
    [90, 5, "sand"],
    [60, 15, "sandy_loam"],
    [35, 30, "clay_loam"],
    [45, 20, "loam"],
  ] as const)("sand %d%% clay %d%% is %s", (sand, clay, expected) => {
    expect(texture_class(sand, clay)).toBe(expected);
  });
});
