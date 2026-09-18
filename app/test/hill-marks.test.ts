// Seam: how steep a stretch of hill is -> how it is drawn on the map and on the strip: a warm
// colour that gets darker as well as redder, which the owner chose by eye over ink that got
// heavier (PLAN.md D47).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { steepnessLevel } from "../src/core/hills";
import { heightRow, hillsLayer } from "../src/core/hills-layer";
import { LEVEL_COLORS, markLook } from "../src/core/mark-look";

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

/** How light a colour is, 0 black to 1 white, the way the eye weighs red, green and blue (WCAG). */
function relativeLuminance(hex: string): number {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

describe("how a hill is drawn", () => {
  const looks = ([1, 2, 3] as const).map((level) => markLook("measured", level));

  it("is one width, in a colour that gets darker as well as redder, so it survives colour blindness and a grey screenshot", () => {
    expect(new Set(looks.map((look) => look.widthPx)).size).toBe(1);
    const light = looks.map((look) => relativeLuminance(look.color));
    expect(light[0]).toBeGreaterThan(light[1] * 1.5);
    expect(light[1]).toBeGreaterThan(light[2] * 1.5);
  });

  it("is never green, and never the blue that means the course", () => {
    for (const look of looks) {
      const [red, green, blue] = [1, 3, 5].map((at) => parseInt(look.color.slice(at, at + 2), 16));
      expect(green, look.color).toBeLessThanOrEqual(red); // red against green is the pair one man in twelve can't tell apart
      expect(blue, look.color).toBeLessThan(red);
    }
  });

  it("uses the same three colours on the strip as on the map", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    for (const level of [1, 2, 3] as const) expect(css).toMatch(new RegExp(`svg \\.level-${level} \\{\\s*fill: ${LEVEL_COLORS[level]};`));
  });

  it("leaves a measured mark that says nothing about how much as plain ink, and a not-measured one as grey dashes", () => {
    expect(markLook("measured")).toMatchObject({ color: "#000000", gap: null });
    expect(markLook("not-measured")).toMatchObject({ color: "#8a8a86", gap: "#f4f4f0" });
  });
});
