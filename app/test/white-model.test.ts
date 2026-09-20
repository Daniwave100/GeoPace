// Seam: the White model as the pipeline writes it -> its loader, and the runner's choice of how
// much of it to draw (issue #7).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWhiteModel, type WhiteModel, WhiteModelError } from "../src/bundle/white-model";
import { parseCourseBundle } from "../src/bundle/loader";
import { FROM_ABOVE_RANGE_M } from "../src/core/ride-view";
import { BUILDINGS_CHOICES, DEFAULT_WHITE_MODEL, loadWhiteModelChoice, saveWhiteModelChoice, SHADOW_CHOICES, SHADOW_QUALITY, type WhiteModelStorage } from "../src/core/white-model";

const committed = (course: string, file: string) => readFileSync(new URL(`../../data/derived/${course}/${file}`, import.meta.url), "utf8");
const berlinJson = committed("berlin", "white-model.json");
const pipelineModel = (): any => JSON.parse(berlinJson);

function rejectionOf(data: unknown): string {
  try {
    parseWhiteModel(data, "berlin");
  } catch (err) {
    expect(err).toBeInstanceOf(WhiteModelError);
    return (err as Error).message;
  }
  throw new Error("expected the White model to be rejected");
}

function fakeStorage(initial: Record<string, string> = {}): WhiteModelStorage {
  const items = { ...initial };
  return { getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value) };
}

describe("the White model's file", () => {
  it("loads what the pipeline wrote, for every committed course", () => {
    for (const course of ["berlin", "nyc"]) {
      const model: WhiteModel = parseWhiteModel(JSON.parse(committed(course, "white-model.json")), course);

      expect(model.course_id).toBe(course);
      expect(model.buildings.ring.length).toBeGreaterThan(1000);
      expect(model.buildings.base_m.length).toBe(model.buildings.ring.length);
      expect(model.attributions.length).toBeGreaterThan(0);
      expect(model.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
    }
  });

  it("is named, counted and credited by the Course Bundle beside it, so the credits show before the geometry arrives", () => {
    for (const course of ["berlin", "nyc"]) {
      const bundle = parseCourseBundle(JSON.parse(committed(course, "course-bundle.json")), course);
      const model = parseWhiteModel(JSON.parse(committed(course, "white-model.json")), course);
      const white = bundle.measured.white_model;

      expect(white).toBeDefined();
      expect(white?.file).toBe("white-model.json");
      expect(white?.buildings).toBe(model.buildings.ring.length);
      expect(white?.corridor_m).toBe(model.corridor_m);
      for (const credit of model.attributions) {
        expect(bundle.attributions.map((a) => a.text)).toContain(credit.text);
      }
    }
  });

  it("stands every block on its own measured ground, tens of metres from sea level and of a different sign in each city", () => {
    // Sea level is about 39.5 m above the ellipsoid in Berlin and 32.5 m below it in New York
    // (PLAN.md D51). A missing or sign-flipped offset would bury the city or float it.
    const berlin = parseWhiteModel(pipelineModel(), "berlin");
    const nyc = parseWhiteModel(JSON.parse(committed("nyc", "white-model.json")), "nyc");

    expect(Math.min(...berlin.buildings.base_m)).toBeGreaterThan(50);
    expect(Math.max(...berlin.buildings.base_m)).toBeLessThan(120);
    expect(Math.min(...nyc.buildings.base_m)).toBeLessThan(0);
    expect(Math.max(...nyc.buildings.base_m)).toBeLessThan(60);
  });

  it("refuses a file this app can't read, and says how to rebuild it", () => {
    const old = pipelineModel();
    old.schema_version = 0;

    const message = rejectionOf(old);
    expect(message).toContain("version 0");
    expect(message).toContain("uv run geopace build berlin");
  });

  it("refuses columns of different lengths: a block without a height is not a block", () => {
    const bad = pipelineModel();
    bad.buildings.roof_m.pop();

    expect(rejectionOf(bad)).toContain("different lengths");
  });

  it("refuses a block turned inside out, whose roof is under its base", () => {
    const bad = pipelineModel();
    bad.buildings.roof_m[7] = bad.buildings.base_m[7] - 1;

    expect(rejectionOf(bad)).toContain("below its base");
  });

  it("refuses an outline with fewer than three corners: a block needs a shape", () => {
    const bad = pipelineModel();
    bad.buildings.ring[3] = [13.4, 52.5, 13.401, 52.5];

    expect(rejectionOf(bad)).toContain("fewer than 6 items");
  });

  it("refuses an outline that isn't whole lon/lat pairs: a stray number means the whole ring is out of step", () => {
    const bad = pipelineModel();
    bad.buildings.ring[3] = [13.4, 52.5, 13.401, 52.5, 13.401, 52.501, 13.4005];

    expect(rejectionOf(bad)).toContain("lon/lat pairs");
  });

  it("refuses something that isn't a White model at all", () => {
    expect(rejectionOf(undefined)).toContain("not a White model");
    expect(rejectionOf([])).toContain("not a White model");
  });
});

describe("how much of the White model to draw", () => {
  it("opens with the buildings on and their shadows cheap", () => {
    expect(loadWhiteModelChoice(fakeStorage())).toEqual(DEFAULT_WHITE_MODEL);
    expect(DEFAULT_WHITE_MODEL).toEqual({ buildings: "on", shadows: "simple" });
  });

  it("remembers the runner's choice, and reads anything else in storage as the default", () => {
    const storage = fakeStorage();
    saveWhiteModelChoice(storage, { buildings: "off", shadows: "detailed" });
    expect(loadWhiteModelChoice(storage)).toEqual({ buildings: "off", shadows: "detailed" });

    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"maybe","shadows":"pretty"}' }))).toEqual(DEFAULT_WHITE_MODEL);
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": "not json" }))).toEqual(DEFAULT_WHITE_MODEL);
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '"on"' }))).toEqual(DEFAULT_WHITE_MODEL);
  });

  it("keeps half a choice: a stored shadow quality still counts when the rest is nonsense", () => {
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"off","shadows":"loud"}' }))).toEqual({ buildings: "off", shadows: DEFAULT_WHITE_MODEL.shadows });
  });

  it("survives storage that is blocked or full", () => {
    const blocked: WhiteModelStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadWhiteModelChoice(blocked)).toEqual(DEFAULT_WHITE_MODEL);
    expect(() => saveWhiteModelChoice(blocked, { buildings: "on", shadows: "off" })).not.toThrow();
  });

  it("offers every choice the switches draw, and only choices the quality table knows", () => {
    expect(BUILDINGS_CHOICES.map((c) => c.choice)).toEqual(["on", "off"]);
    expect(SHADOW_CHOICES.map((c) => c.choice)).toEqual(["off", "simple", "detailed"]);
    for (const { choice } of SHADOW_CHOICES) {
      if (choice !== "off") expect(SHADOW_QUALITY[choice]).toBeDefined();
    }
  });

  /**
   * The trap this ticket fell into: CesiumJS draws no shadow further from the camera than
   * `maximumDistance`, so a limit under the height the camera flies at shadows nothing at all —
   * silently, with the shadow map switched on and the sun in the right place. The Ride's From
   * above camera holds 1,500 m (PLAN.md D53), and a runner looking at a street from the air is
   * further from the ground than they are above it.
   */
  it("draws shadows further away than any camera this app flies at", () => {
    for (const { size, soft, withinM } of Object.values(SHADOW_QUALITY)) {
      expect(withinM).toBeGreaterThan(FROM_ABOVE_RANGE_M * 2);
      expect(size).toBeGreaterThanOrEqual(1024);
      expect(typeof soft).toBe("boolean");
    }
  });

  it("makes the detailed setting cost more than the simple one, or there is nothing to choose", () => {
    expect(SHADOW_QUALITY.detailed.size).toBeGreaterThan(SHADOW_QUALITY.simple.size);
    expect(SHADOW_QUALITY.simple.soft).toBe(false);
  });
});
