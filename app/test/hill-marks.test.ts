// Seam: how steep a stretch of hill is, and which way -> how it is drawn on the map and on the
// strip. Going up is warm, coming down is teal, and either way the colour fades from pale to deep
// as the road gets steeper, with no sudden change (PLAN.md D47: the owner's picks, by eye).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { howSteep } from "../src/core/hills";
import { heightRow, hillsLayer } from "../src/core/hills-layer";
import { HALFTONE_PITCH_PX, markLook, rampColor, RIM_DOT_SHARE, RIM_PX, rimDotRadius, rimLook } from "../src/core/mark-look";
import { COURSE_EDGE } from "../src/scene/course-ribbon";

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

  it("leaves a measured mark that says nothing about how much as plain ink", () => {
    expect(markLook("measured")).toMatchObject({ color: "#000000", gap: null });
    expect(markLook("measured", -0.5)).toMatchObject({ color: rampColor(-0.5), gap: null });
  });
});

describe("a stretch that is not measured, on the map", () => {
  // Twice the owner, looking at New York in photoreal, took the dashes for a fault in the drawing:
  // "checkered boxes", then "weird rectangles". Blocks beside a line look like a glitch, and on the
  // Queensboro's 80 m gap they were a white box with three squares in it. So on the map "not
  // measured here" is what greying out means everywhere else: the hill's band with the colour taken
  // out. The strip still dashes its trace and the sentence still strikes its words through (D47).
  const contrast = (a: string, b: string) => {
    const [dark, light] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
    return (light + 0.05) / (dark + 0.05);
  };

  it("is a flat grey band, built like a hill's: the same width, the same hairline edge, no pattern", () => {
    const [grey, hill] = [markLook("not-measured"), markLook("measured", 0.5)];
    expect(grey).toMatchObject({ color: "#8a8a86", gap: null });
    expect(grey).toMatchObject({ widthPx: hill.widthPx, edge: hill.edge, edgePx: hill.edgePx });
  });

  it("shows on any ground without help from it: the grey stands between the hairline and the course's white edge, and reads against both", () => {
    // Mid grey is the one tone a road in a photograph may match exactly. The band is still there
    // to see, because what bounds it is ours: black outside, white inside.
    const grey = markLook("not-measured");
    expect(grey.edgePx).toBeGreaterThan(0);
    expect(contrast(grey.color, grey.edge)).toBeGreaterThanOrEqual(3); // what a mark needs to be told from its neighbour (WCAG 1.4.11)
    expect(contrast(grey.color, COURSE_EDGE)).toBeGreaterThanOrEqual(3);
  });

  it("can't be taken for a hill: no hill is ever grey", () => {
    const [red, green, blue] = rgb(markLook("not-measured").color);
    expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(12);
    for (const amount of [-1, -0.5, -0.1, 0.1, 0.5, 1]) {
      const [r, g, b] = rgb(rampColor(amount));
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(60);
    }
  });
});

describe("a dashed mark (a sample), over a pale map and over dark imagery", () => {
  const contrast = (a: string, b: string) => {
    const [dark, light] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
    return (light + 0.05) / (dark + 0.05);
  };
  const greys = Array.from({ length: 52 }, (_, i) => `#${(i * 5).toString(16).padStart(2, "0").repeat(3)}`);

  it("carries its own ground, so the dashes are always seen against the same thing", () => {
    const look = markLook("sample");
    if (look.gap === null) throw new Error("expected a dashed mark");
    // The colour between the dashes is a band that also runs unbroken down both sides of them:
    // a dash is never next to the map, whatever the map looks like there.
    expect(look.dashInsetPx).toBeGreaterThanOrEqual(1.5);
    expect(contrast(look.color, look.gap)).toBeGreaterThanOrEqual(3);
    // Enough of each dash shows on each side of the blue course line, which runs down the middle
    // of the same line. From the middle outwards: the course, the dash, the inset, the edge.
    expect(look.widthPx - look.dashInsetPx).toBeGreaterThanOrEqual(3);
  });

  it("shows its band on any ground: by itself where the ground is dark, by its edge where it is pale", () => {
    const look = markLook("sample");
    if (look.gap === null) throw new Error("expected a dashed mark");
    expect(look.edgePx).toBeGreaterThan(0);
    for (const ground of greys) expect(Math.max(contrast(ground, look.gap), contrast(ground, look.edge)), `over ${ground}`).toBeGreaterThanOrEqual(3);
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

describe("shade, as a rule of ink beside the band (PLAN.md D63)", () => {
  // The owner, 09-22, with Hills and Shade on together: the hills' band "makes sense", but with
  // Shade on the line "can get a little bit confusing". The rim is thinner than the band, only
  // ever ink, paper or grey, and its halftone is a screen fixed to the paper, not counted along the line.
  const contrast = (a: string, b: string) => {
    const [dark, light] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
    return (light + 0.05) / (dark + 0.05);
  };
  const greys = Array.from({ length: 52 }, (_, i) => `#${(i * 5).toString(16).padStart(2, "0").repeat(3)}`);
  const encodings = ["measured", "depends-on-leaves", "not-measured", "runner-report", "sample"] as const;

  it("is a rule, never as wide as the band, and never takes a ramp colour", () => {
    expect(rimLook("measured").widthPx).toBeLessThan(markLook("measured", 0.5).widthPx);
    for (const encoding of encodings) {
      const look = rimLook(encoding);
      for (const colour of [look.color, look.edge, ...(look.gap ? [look.gap] : [])]) expect(["#000000", "#f4f4f0", "#8a8a86"], `${encoding}'s ${colour}`).toContain(colour);
    }
  });

  it("shows on any ground: by itself where the ground is pale, by its paper hairline where it is dark", () => {
    for (const encoding of ["measured", "depends-on-leaves"] as const) {
      const look = rimLook(encoding);
      const fill = look.gap ?? look.color;
      expect(look.edgePx).toBeGreaterThan(0);
      for (const ground of greys) expect(Math.max(contrast(fill, ground), contrast(look.edge, ground)), `${encoding} over ${ground}`).toBeGreaterThanOrEqual(3);
    }
    // Not measured: the grey stands between its paper hairline and the course's white edge, and reads against both.
    const grey = rimLook("not-measured");
    expect(grey.gap).toBeNull();
    expect(contrast(grey.color, grey.edge)).toBeGreaterThanOrEqual(3);
    expect(contrast(grey.color, COURSE_EDGE)).toBeGreaterThanOrEqual(3);
  });

  it("always shows a tree's dots: at every offset against the screen a 3 px rule meets at least a pixel of a dot, which a 2 px one would not", () => {
    // The dots are a grid fixed to the screen (scene/course-ribbon.ts), so what a stripe shows
    // depends on where it happens to fall against that grid. A stripe narrower than the paper
    // between two dots can fall wholly on the ink, and a tree's shade would then look like a wall's.
    const dotPx = 2 * rimDotRadius() * HALFTONE_PITCH_PX;
    const worstOverlap = (stripePx: number) => {
      let worst = Number.POSITIVE_INFINITY;
      for (let offset = 0; offset < HALFTONE_PITCH_PX; offset += 0.01) {
        let overlap = 0;
        for (let cell = -1; cell <= 2; cell += 1) {
          const centre = (cell + 0.5) * HALFTONE_PITCH_PX;
          overlap += Math.max(0, Math.min(offset + stripePx, centre + dotPx / 2) - Math.max(offset, centre - dotPx / 2));
        }
        worst = Math.min(worst, overlap);
      }
      return worst;
    };
    expect(rimLook("depends-on-leaves").widthPx).toBe(RIM_PX);
    expect(worstOverlap(RIM_PX)).toBeGreaterThanOrEqual(1);
    expect(worstOverlap(2)).toBeLessThan(1);
    // The rim's dots are the crowns' size, give or take a hair, so the tree and its shade are printed alike.
    expect(rimDotRadius(RIM_DOT_SHARE)).toBeGreaterThan(0.22);
    expect(rimDotRadius(RIM_DOT_SHARE)).toBeLessThan(0.31);
  });
});
