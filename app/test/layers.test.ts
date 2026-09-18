// Seam: which layer switches are pressed -> what is on the map, on the strip and in the sentence.
// PLAN.md D35: a layer marks the course line, adds its row to the strip and its clause to the
// sentence, all three or none; one layer at a time; "Show everything" opens the full strip.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { ENCODINGS, type Encoding } from "../src/core/encoding";
import { heightRow, hillsLayer } from "../src/core/hills-layer";
import { type Layer, NO_LAYERS, onScreen, pressEverything, pressLayer } from "../src/core/layers";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

/** A stand-in for a layer a later ticket will add, to show the system isn't built around Hills. */
const sun: Layer = { id: "sun", name: "Sun", rows: () => [], lineMarks: () => [], lineLabels: () => [], clause: () => ({ text: "In the sun for 55 to 80% of this stretch.", encoding: "measured" }) };

describe("the layer switches", () => {
  it("start with nothing on: the first screen shows little", () => {
    expect(NO_LAYERS).toEqual({ active: null, everything: false });
  });

  it("turn a layer on, and off again when it is pressed a second time", () => {
    const on = pressLayer(NO_LAYERS, "hills");
    expect(on.active).toBe("hills");
    expect(pressLayer(on, "hills").active).toBeNull();
  });

  it("keep one layer on at a time: pressing another swaps it", () => {
    const swapped = pressLayer(pressLayer(NO_LAYERS, "hills"), "sun");
    expect(swapped.active).toBe("sun");
  });

  it("leave the layer alone when Show everything is pressed, and the other way round", () => {
    const both = pressEverything(pressLayer(NO_LAYERS, "hills"));
    expect(both).toEqual({ active: "hills", everything: true });
    expect(pressLayer(both, "hills")).toEqual({ active: null, everything: true });
    expect(pressEverything(both).everything).toBe(false);
  });
});

describe("what a layer puts on screen", () => {
  const layers = [hillsLayer(nyc), sun];

  it("is nothing at all while no layer is on", () => {
    const screen = onScreen(NO_LAYERS, layers);
    expect(screen.rows).toEqual([]);
    expect(screen.lineMarks).toEqual([]);
    expect(screen.lineLabels).toEqual([]);
    expect(screen.clause(24.5, "km")).toBeNull();
  });

  it("is all three with Hills on: marks on the course line, rows on the strip, a clause in the sentence", () => {
    const screen = onScreen(pressLayer(NO_LAYERS, "hills"), layers);

    expect(screen.rows.map((row) => row.name)).toEqual(["Grade", "Effort"]);
    expect(screen.lineMarks.length).toBeGreaterThan(10);
    expect(screen.lineLabels.length).toBeGreaterThan(10);
    expect(screen.clause(24.5, "km")?.text).toBe("Climbing 4%.");
  });

  it("is none of the three again once Hills is switched off", () => {
    const off = pressLayer(pressLayer(NO_LAYERS, "hills"), "hills");
    const screen = onScreen(off, layers);
    expect([screen.rows, screen.lineMarks, screen.lineLabels, screen.clause(24.5, "km")]).toEqual([[], [], [], null]);
  });

  it("shows only the layer that is on", () => {
    const screen = onScreen(pressLayer(NO_LAYERS, "sun"), layers);
    expect(screen.rows).toEqual([]);
    expect(screen.clause(24.5, "km")?.text).toMatch(/In the sun/);
  });

  it("opens every layer's rows with Show everything, without marking the map or lengthening the sentence", () => {
    const screen = onScreen(pressEverything(NO_LAYERS), layers);
    expect(screen.rows.map((row) => row.name)).toEqual(["Grade", "Effort"]);
    expect(screen.lineMarks).toEqual([]);
    expect(screen.clause(24.5, "km")).toBeNull();
  });
});

describe("the Hills layer", () => {
  const hills = hillsLayer(nyc);

  it("prints the value under the cursor for each row, in the runner's units", () => {
    const [grade, effort] = hills.rows();
    expect(grade.valueAt(24.5, "km").text).toMatch(/^\+3\.\d%$/);
    // 20% more energy than the same distance on flat ground.
    expect(effort.valueAt(24.5, "km").text).toMatch(/^\+\d\d%$/);
    expect(effort.scale("km")).toBe("energy vs flat ground");
    expect(grade.scale("km")).toMatch(/^%, −\d\.\d to \+\d\.\d$/);
  });

  it("marks each climb and descent on the course line, solid where measured, with one label per hill", () => {
    const queensboroClimb = hills.lineMarks().find((mark) => mark.fromKm > 23 && mark.fromKm < 24);
    const label = hills.lineLabels().find((candidate) => candidate.startKm > 23 && candidate.startKm < 24);

    expect(queensboroClimb?.encoding).toBe("measured");
    expect(label?.encoding).toBe("measured");
    expect(label?.text("km")).toBe("Up 3.0% · 1.3 km");
    expect(label?.text("mi")).toBe("Up 3.0% · 0.8 mi");
    // The biggest hill wins the room when labels collide: down off the Verrazzano, 61 m.
    const first = hills.lineLabels().reduce((best, candidate) => (candidate.priority > best.priority ? candidate : best));
    expect(first.text("km")).toBe("Down 3.2% · 2.0 km");
    expect(first.startKm).toBeLessThan(1);
    // One label per hill, however many pieces its line is cut into.
    expect(hills.lineLabels()).toHaveLength(28);
  });

  it("greys every stretch that is not measured on the map, whether or not a hill runs over it", () => {
    // The map must not say less than the strip and the sentence do: they grey all of them.
    for (const bundle of [nyc, berlin]) {
      const greyed = hillsLayer(bundle).lineMarks().filter((mark) => mark.encoding === "not-measured");
      expect(greyed.map((mark) => [mark.fromKm, mark.toKm])).toEqual(bundle.measured.elevation_not_measured.map((gap) => [gap.km_start, gap.km_end]));
    }
    // Berlin has two hills and ten short bridges; none of the bridges is on a hill.
    expect(hillsLayer(berlin).lineMarks().filter((mark) => mark.encoding === "not-measured")).toHaveLength(10);
  });

  it("never draws a filled-in stretch as measured: the solid pieces stop where the gaps begin", () => {
    const gaps = nyc.measured.elevation_not_measured;
    for (const solid of hills.lineMarks().filter((mark) => mark.encoding === "measured")) {
      for (const gap of gaps) expect(Math.min(solid.toKm, gap.km_end) - Math.max(solid.fromKm, gap.km_start), `solid ${solid.fromKm}-${solid.toKm} over the gap at ${gap.km_start}`).toBeLessThanOrEqual(0);
    }
    // The hill down off the Verrazzano starts inside the unscanned span: its label says part of it isn't measured.
    const verrazzanoDescent = hills.lineLabels().find((candidate) => candidate.text("km").startsWith("Down") && candidate.startKm < 1);
    expect(verrazzanoDescent?.note).toMatch(/^Part of this hill is not measured\. Verrazzano/);
    expect(hills.clause(1.0, "km")).toMatchObject({ encoding: "not-measured" });
    expect(hills.clause(1.0, "km")?.note).toMatch(/Verrazzano/);
    expect(hills.rows()[0].valueAt(1.0, "km").notMeasured).toMatch(/Verrazzano.*straight line/);
    expect(hills.rows()[0].valueAt(5.0, "km").notMeasured).toBeNull();
  });

  it("calls a road flat when a runner would, and puts no sign on a grade of nothing", () => {
    const flatCourse = structuredClone(berlin);
    flatCourse.measured.course_line.grade = flatCourse.measured.course_line.grade.map(() => 0.0002);
    flatCourse.measured.course_line.difficulty = flatCourse.measured.course_line.difficulty.map(() => 1.001);
    const [grade, effort] = hillsLayer(flatCourse).rows();

    expect(hillsLayer(berlin).clause(10, "km")?.text).toBe("Flat.");
    expect(grade.valueAt(10, "km").text).toBe("0.0%");
    expect(effort.valueAt(10, "km").text).toBe("0%");
  });
});

describe("the strip's own row, the height", () => {
  it("is there whatever the layers are doing, with its scale, the value under the cursor and the course's total climb", () => {
    const height = heightRow(nyc);

    expect(height.scale("km")).toBe("m, 2 to 78");
    expect(height.scale("mi")).toBe("ft, 8 to 256");
    expect(height.summary?.("km")).toBe("up 262 m, down 293 m");
    expect(height.summary?.("mi")).toBe("up 860 ft, down 962 ft");
    expect(height.valueAt(0, "km")).toEqual({ text: "56 m", notMeasured: null });
    // The crest of the Verrazzano is a straight line between measured heights: struck through, with the reason.
    expect(height.valueAt(1.0, "mi").text).toBe("250 ft"); // 76.2 m
    expect(height.valueAt(1.0, "mi").notMeasured).toMatch(/Verrazzano/);
  });
});

describe("the four encodings", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const all = Object.keys(ENCODINGS) as Encoding[];

  it("are measured, runner report, not measured here, and sample", () => {
    expect(all).toEqual(["measured", "runner-report", "not-measured", "sample"]);
  });

  it("each look different from the other three on every surface: the map, the strip and text", () => {
    expect(new Set(all.map((encoding) => ENCODINGS[encoding].cssClass)).size).toBe(4);
    expect(new Set(all.map((encoding) => ENCODINGS[encoding].mapLine)).size).toBe(4);
  });

  it("are drawn by one class each, which the stylesheet defines for every surface: words, strip marks and map labels", () => {
    for (const encoding of all) {
      const name = ENCODINGS[encoding].cssClass;
      // Each its own rule, at the start of a line: `svg .enc-x` must not count as the rule for words.
      expect(css, `${name} in words`).toMatch(new RegExp(`^\\.${name}[ ,{]`, "m"));
      expect(css, `${name} on the strip`).toMatch(new RegExp(`^svg \\.${name}[ ,.{]`, "m"));
      expect(css, `${name} on a map label`).toMatch(new RegExp(`^\\.map-label\\.${name}[ ,{]`, "m"));
    }
  });

  it("say in words what a reader who can't rely on the look needs to hear", () => {
    expect(ENCODINGS["not-measured"].saidAfter).toBe("Not measured here.");
    expect(ENCODINGS.sample.saidAfter).toBe("(sample)");
    expect(ENCODINGS.measured.saidAfter).toBe("");
  });
});
