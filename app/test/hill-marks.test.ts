// Seam: how steep a stretch of hill is, and which way -> how it is drawn on the map and on the
// strip. Going up is warm, coming down is teal, and either way the colour fades from pale to deep
// as the road gets steeper, with no sudden change (PLAN.md D47: the owner's picks, by eye).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { howSteep } from "../src/core/hills";
import { heightRow, hillsLayer } from "../src/core/hills-layer";
import { markLook, rampColor } from "../src/core/mark-look";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

/** How light a colour is, 0 black to 1 white, the way the eye weighs red, green and blue (WCAG). */
function relativeLuminance(hex: string): number {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

describe("how steep is steep", () => {
  it("is nothing on the flat, and grows smoothly from gentle to steep, the same up and down but for its sign", () => {
    expect(howSteep(0.4)).toBe(0); // flat: not a hill, not marked
    expect(howSteep(-0.9)).toBe(0);
    expect(howSteep(1.0)).toBeGreaterThan(0); // every part of a hill is at least gentle
    expect(howSteep(1.0)).toBeLessThan(0.1);
    expect(howSteep(3)).toBeCloseTo(0.5, 1); // a proper hill is the middle of the scale
    expect(howSteep(4.5)).toBe(1); // steep is the end of it
    expect(howSteep(9)).toBe(1);
    expect(howSteep(-3)).toBeCloseTo(-howSteep(3), 9); // the ramp down off a bridge is as much of a hill as the ramp up
    expect(howSteep(-5.9)).toBe(-1);
  });

  it("has no steps in it: a little steeper is a little more", () => {
    for (let grade = 1; grade < 4.5; grade += 0.1) expect(howSteep(grade + 0.1) - howSteep(grade)).toBeLessThan(0.05);
  });
});

describe("the colour of a hill", () => {
  const steps = Array.from({ length: 11 }, (_, i) => i / 10);

  it("goes from pale yellow through orange to deep red going up, getting darker all the way", () => {
    expect(rampColor(0.0001)).toBe("#ffd84d");
    expect(rampColor(0.5)).toBe("#f07f1f");
    expect(rampColor(1)).toBe("#a3150f");
    const light = steps.map((amount) => relativeLuminance(rampColor(Math.max(amount, 0.0001))));
    light.slice(1).forEach((value, i) => expect(value, `step ${i + 1}`).toBeLessThan(light[i]));
  });

  it("goes from pale aqua through teal to deep teal coming down, getting darker all the way", () => {
    const light = steps.map((amount) => relativeLuminance(rampColor(-Math.max(amount, 0.0001))));
    light.slice(1).forEach((value, i) => expect(value, `step ${i + 1}`).toBeLessThan(light[i]));
    // As strong at the steep end as going up is, so a steep descent is as plain to see as a steep climb.
    expect(relativeLuminance(rampColor(-1))).toBeCloseTo(relativeLuminance(rampColor(1)), 1);
  });

  it("fades: a tenth more is never a jump", () => {
    for (const way of [1, -1]) {
      for (let amount = 0.05; amount < 1; amount += 0.05) {
        const [a, b] = [rgb(rampColor(way * amount)), rgb(rampColor(way * (amount + 0.05)))];
        expect(Math.max(...a.map((value, i) => Math.abs(value - b[i])))).toBeLessThan(24);
      }
    }
  });

  it("is never green going up, and coming down is never the blue that means the course", () => {
    for (const amount of steps.slice(1)) {
      const [upRed, upGreen, upBlue] = rgb(rampColor(amount));
      expect(upGreen).toBeLessThanOrEqual(upRed); // red against green is the pair one man in twelve can't tell apart
      expect(upBlue).toBeLessThan(upRed);
      const [downRed, downGreen, downBlue] = rgb(rampColor(-amount));
      expect(downRed).toBeLessThan(downGreen); // plainly not warm
      expect(downBlue).toBeLessThanOrEqual(downGreen); // teal leans green: the course is the only blue
    }
  });

  it("leaves a measured mark that says nothing about how much as plain ink, and a not-measured one as grey dashes", () => {
    expect(markLook("measured")).toMatchObject({ color: "#000000", gap: null });
    expect(markLook("measured", -0.5)).toMatchObject({ color: rampColor(-0.5), gap: null });
    expect(markLook("not-measured")).toMatchObject({ color: "#8a8a86", gap: "#f4f4f0" });
  });
});

describe("the Hills layer's marks, by steepness", () => {
  const solid = (bundle: typeof nyc) => hillsLayer(bundle).lineMarks().filter((mark) => mark.encoding === "measured");

  it("marks climbs warm and descents cool, from gentle to as steep as the course gets", () => {
    const amounts = solid(nyc).map((mark) => mark.howMuch ?? 0);
    expect(Math.max(...amounts)).toBe(1); // the ramp onto the Willis Avenue Bridge, 5.5%
    expect(Math.min(...amounts)).toBe(-1); // the ramp down off the Queensboro, 5.9%
    expect(amounts.every((amount) => amount !== 0)).toBe(true);
    // Halfway up the Queensboro (3.5 to 3.8%) is well past the middle of the scale.
    const at = solid(nyc).find((mark) => mark.fromKm <= 24.5 && mark.toKm >= 24.5);
    expect(at?.howMuch).toBeGreaterThan(0.6);
  });

  it("fades along a hill: nearly every piece is one shade from the one before it", () => {
    const marks = solid(nyc);
    const shadesApart: number[] = [];
    for (let i = 1; i < marks.length; i += 1) {
      const joined = Math.abs(marks[i].fromKm - marks[i - 1].toKm) < 1e-6;
      if (joined) shadesApart.push(Math.round(Math.abs((marks[i].howMuch ?? 0) - (marks[i - 1].howMuch ?? 0)) * 10));
    }
    expect(shadesApart.filter((apart) => apart === 1).length / shadesApart.length).toBeGreaterThan(0.9);
    // Never more than the road itself: in a couple of places it lurches from 1.8% to 4.0% in
    // 30 m (km 16.1), and three shades in 10 m is that, faithfully drawn.
    expect(Math.max(...shadesApart)).toBeLessThanOrEqual(3);
  });

  it("keeps the number of pieces the map has to draw in the hundreds, not the thousands, and their colours few", () => {
    expect(solid(nyc).length).toBeLessThan(400);
    expect(new Set(solid(nyc).map((mark) => mark.howMuch)).size).toBeLessThanOrEqual(21);
  });

  it("finds nothing but gentle hills in Berlin", () => {
    for (const mark of solid(berlin)) expect(Math.abs(mark.howMuch ?? 0)).toBeLessThanOrEqual(0.2);
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

  it("gives the strip's Grade row the same scale, bin by bin, and leaves the height row alone", () => {
    const [grade] = hillsLayer(nyc).rows();
    const amounts = grade.howMuch?.(400) ?? [];
    expect(amounts).toHaveLength(400);
    expect(Math.max(...amounts)).toBeGreaterThan(0.7);
    expect(Math.min(...amounts)).toBeLessThan(-0.7);
    expect(amounts.filter((amount) => amount === 0).length).toBeGreaterThan(150); // most of New York is flat
    expect(heightRow(nyc).howMuch).toBeUndefined();
  });
});
