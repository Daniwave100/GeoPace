// Seam: the White model as the pipeline writes it -> its loader, and the runner's choice of how
// much of it to draw (issue #7).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWhiteModel, type WhiteModel, WhiteModelError } from "../src/bundle/white-model";
import { parseCourseBundle } from "../src/bundle/loader";
import { FROM_ABOVE_RANGE_M } from "../src/core/ride-view";
import { BUILDINGS_CHOICES, DEFAULT_WHITE_MODEL, loadWhiteModelChoice, saveWhiteModelChoice, SHADOW_DISTANCE, shadowDistanceM, SHADOWS, SHADOWS_CHOICES, type WhiteModelStorage } from "../src/core/white-model";

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
  it("opens with the city and its shadows both on", () => {
    expect(loadWhiteModelChoice(fakeStorage())).toEqual(DEFAULT_WHITE_MODEL);
    expect(DEFAULT_WHITE_MODEL).toEqual({ buildings: "on", shadows: "on" });
  });

  it("remembers the runner's choice, and reads anything else in storage as the default", () => {
    const storage = fakeStorage();
    saveWhiteModelChoice(storage, { buildings: "off", shadows: "off" });
    expect(loadWhiteModelChoice(storage)).toEqual({ buildings: "off", shadows: "off" });

    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"maybe","shadows":"pretty"}' }))).toEqual(DEFAULT_WHITE_MODEL);
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": "not json" }))).toEqual(DEFAULT_WHITE_MODEL);
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '"on"' }))).toEqual(DEFAULT_WHITE_MODEL);
  });

  it("reads the two shadow qualities an older version wrote as shadows on, because both were", () => {
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"on","shadows":"simple"}' })).shadows).toBe("on");
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"on","shadows":"detailed"}' })).shadows).toBe("on");
    expect(loadWhiteModelChoice(fakeStorage({ "geopace.white-model": '{"buildings":"off","shadows":"off"}' }))).toEqual({ buildings: "off", shadows: "off" });
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

  it("offers one quality and a way to turn it off, which is the way down on an older computer", () => {
    expect(BUILDINGS_CHOICES.map((c) => c.choice)).toEqual(["on", "off"]);
    expect(SHADOWS_CHOICES.map((c) => c.choice)).toEqual(["on", "off"]);
    expect(SHADOWS.size).toBe(4096);
    expect(SHADOWS.soft).toBe(true);
  });
});

describe("how far the shadows reach", () => {
  /**
   * The trap this cost an evening (PLAN.md §8): CesiumJS draws no shadow further from the camera
   * than `maximumDistance`, so a reach under the camera's own distance to the ground shadows
   * nothing at all — silently, with the shadow map on and the sun in the right place. A camera
   * tilted 50 degrees is about 1.3 times its height from the ground it looks at; three times the
   * height leaves room to see ahead of that.
   */
  it("always reaches well past the ground the camera is looking at", () => {
    for (const height of [0, 3, 50, 400, 1500, 4000, 12000, 43000]) {
      expect(shadowDistanceM(height)).toBeGreaterThan(Math.min(height * 1.4, SHADOW_DISTANCE.atMostM - 1));
    }
    expect(shadowDistanceM(FROM_ABOVE_RANGE_M)).toBeGreaterThan(FROM_ABOVE_RANGE_M * 2);
  });

  it("holds a floor on the road, where the camera is three metres up but the street runs away", () => {
    expect(shadowDistanceM(0)).toBe(SHADOW_DISTANCE.atLeastM);
    expect(shadowDistanceM(3)).toBe(SHADOW_DISTANCE.atLeastM);
    expect(shadowDistanceM(-5)).toBe(SHADOW_DISTANCE.atLeastM);
  });

  it("follows the camera up, so the one shadow map is never spread further than it has to be", () => {
    expect(shadowDistanceM(2000)).toBeLessThan(shadowDistanceM(6000));
    expect(shadowDistanceM(6000)).toBeLessThan(SHADOW_DISTANCE.atMostM);
    // Ten times higher must not mean ten times coarser than it needs to be near the ground.
    expect(shadowDistanceM(400)).toBeLessThan(shadowDistanceM(4000) / 2);
  });

  it("stops climbing where no shadow map could help: the whole course from tens of kilometres up", () => {
    expect(shadowDistanceM(20000)).toBe(SHADOW_DISTANCE.atMostM);
    expect(shadowDistanceM(43000)).toBe(SHADOW_DISTANCE.atMostM);
  });

  it("answers in steps, so a camera drifting up and down doesn't rebuild the cascades every frame", () => {
    const drifting = [1000, 1010, 1020, 1030, 1040];
    expect(new Set(drifting.map(shadowDistanceM)).size).toBe(1);
  });
});
