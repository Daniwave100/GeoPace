// Seam: how steep a stretch of hill is -> how it is drawn on the map and on the strip, in the two
// looks the owner is choosing between (a trial, PLAN.md §10): A, the weight of the ink, and
// B, a colour that also gets darker as it gets steeper.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { steepnessLevel } from "../src/core/hills";
import { heightRow, hillsLayer } from "../src/core/hills-layer";
import { HILL_LOOKS, hillLookFromUrl, markLook, relativeLuminance } from "../src/core/mark-look";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

describe("how steep is steep", () => {
  it("has three steps a runner would recognise, the same up and down", () => {
    expect(steepnessLevel(0.4)).toBe(0); // flat
    expect(steepnessLevel(1.0)).toBe(1); // gentle
    expect(steepnessLevel(1.9)).toBe(1);
    expect(steepnessLevel(2.0)).toBe(2); // a proper hill
    expect(steepnessLevel(3.5)).toBe(3); // steep
    expect(steepnessLevel(-3.8)).toBe(3); // the ramp down off a bridge hurts too
    expect(steepnessLevel(-1.2)).toBe(1);
  });
});

describe("the Hills layer's marks, by steepness", () => {
  const solid = (bundle: typeof nyc) => hillsLayer(bundle).lineMarks().filter((mark) => mark.encoding === "measured");

  it("cuts each hill into pieces by how steep each part is", () => {
    const levels = new Set(solid(nyc).map((mark) => mark.level));
    expect([...levels].sort()).toEqual([1, 2, 3]);
    // The steep part of the Queensboro climb (3.5 to 3.8% around km 24.5) is a level-3 piece.
    expect(solid(nyc).some((mark) => mark.level === 3 && mark.fromKm <= 24.5 && mark.toKm >= 24.5)).toBe(true);
  });

  it("finds nothing steep in Berlin: its two hills are gentle all the way", () => {
    expect(new Set(solid(berlin).map((mark) => mark.level))).toEqual(new Set([1]));
  });

  it("still covers every hill end to end, with no piece overlapping the next", () => {
    const marks = hillsLayer(nyc).lineMarks();
    marks.slice(1).forEach((mark, i) => expect(mark.fromKm, `piece at ${mark.fromKm}`).toBeGreaterThanOrEqual(marks[i].toKm - 1e-9));
    // The Queensboro climb (km 23.53 to 24.81) has no hole in it.
    const climb = marks.filter((mark) => mark.fromKm >= 23.5 && mark.toKm <= 24.85);
    expect(climb[0].fromKm).toBeCloseTo(23.53, 1);
    expect(climb[climb.length - 1].toKm).toBeCloseTo(24.81, 1);
    climb.slice(1).forEach((mark, i) => expect(mark.fromKm).toBeCloseTo(climb[i].toKm, 6));
  });

  it("gives the strip's Grade row the same steps, bin by bin, and leaves the height row alone", () => {
    const [grade] = hillsLayer(nyc).rows();
    const levels = grade.levels?.(400) ?? [];
    expect(levels).toHaveLength(400);
    expect(new Set(levels)).toEqual(new Set([0, 1, 2, 3]));
    expect(heightRow(nyc).levels).toBeUndefined();
  });
});

describe("the two looks on trial", () => {
  it("A is ink, and heavier the steeper it gets", () => {
    const looks = [1, 2, 3].map((level) => markLook("measured", level as 1 | 2 | 3, "ink"));
    expect(looks.map((look) => look.color)).toEqual(["#000000", "#000000", "#000000"]);
    expect(looks[0].widthPx).toBeLessThan(looks[1].widthPx);
    expect(looks[1].widthPx).toBeLessThan(looks[2].widthPx);
  });

  it("B is one width, in a colour that gets darker as well as redder, so it survives colour blindness and a grey screenshot", () => {
    const looks = [1, 2, 3].map((level) => markLook("measured", level as 1 | 2 | 3, "colour"));
    expect(new Set(looks.map((look) => look.widthPx)).size).toBe(1);
    const light = looks.map((look) => relativeLuminance(look.color));
    expect(light[0]).toBeGreaterThan(light[1] * 1.5);
    expect(light[1]).toBeGreaterThan(light[2] * 1.5);
    // No green anywhere: red against green is the pair one man in twelve can't tell apart.
    for (const look of looks) expect(parseInt(look.color.slice(3, 5), 16)).toBeLessThanOrEqual(parseInt(look.color.slice(1, 3), 16));
  });

  it("never changes how a stretch that is not measured looks: that is not part of the trial", () => {
    expect(markLook("not-measured", undefined, "ink")).toEqual(markLook("not-measured", undefined, "colour"));
  });

  it("can be chosen in the page's address, so a look can be reloaded and shown to someone", () => {
    expect(hillLookFromUrl("?course=nyc&hills=colour")).toBe("colour");
    expect(hillLookFromUrl("?hills=ink")).toBe("ink");
    expect(hillLookFromUrl("?hills=rainbow")).toBe("ink");
    expect(hillLookFromUrl("")).toBe("ink");
    expect(HILL_LOOKS.map((look) => look.id)).toEqual(["ink", "colour"]);
  });
});
