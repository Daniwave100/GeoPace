// Seam: the Course Bundle's sun table and one runner's plan -> is the sun on this 10 m of road at
// the moment they reach it? Binary, never a share (PLAN.md D58).
//
// Two traps live here. The first is the one the ticket names: the numbers and the White model's
// shadows on the map have to be the same sun, and they are only because both halves compute it
// the same way — so the app's own solar code is checked against the ephemeris the pipeline wrote.
// The second is honesty at the edges: where the sun is under the floor the pipeline works shade
// out above, or the runner arrives outside the hours it covered, nothing was measured and nothing
// may be drawn as if it had been.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { CourseBundle, Edition } from "../src/bundle/types";
import { createPlanner, type Goal, plannerCourse, type RacePlan } from "../src/core/planner";
import { sunPosition } from "../src/core/solar";
import { readSunTable, sunAlong } from "../src/core/sun";
import { shadeLayer } from "../src/core/shade-layer";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const berlin = bundleFor("berlin");
const nyc = bundleFor("nyc");

const plannerFor = (bundle: CourseBundle, plan: RacePlan) => createPlanner(plannerCourse(bundle), plan);
const firstWavePlan = (bundle: CourseBundle): RacePlan => ({ courseId: bundle.course_id, edition: 2026, waveId: "wave-1", ownStartLocal: null, goal: { kind: "finish", seconds: 4 * 3600 } });

/** Where a km falls in the course line's samples. */
function sampleAt(bundle: CourseBundle, km: number): number {
  const line = bundle.measured.course_line;
  return line.km.reduce((best, _, i) => (Math.abs(line.km[i] - km) < Math.abs(line.km[best] - km) ? i : best), 0);
}

describe("the sun the pipeline worked the shade out with", () => {
  it("is the sun the app draws the shadows with: both halves, step for step, on both courses", () => {
    // The acceptance the ticket asks for — the White model's shadows agree with the band — rests
    // on this. The scene's own sun comes from core/solar.ts; the bits come from the pipeline's.
    for (const bundle of [berlin, nyc]) {
      const sun = bundle.measured.sun;
      if (!sun) throw new Error(`${bundle.course_id} has no sun table`);
      const firstMs = Date.parse(sun.first_step);
      sun.altitude_deg.forEach((altitude, step) => {
        const ours = sunPosition(new Date(firstMs + step * sun.step_minutes * 60_000), sun.reference.lat, sun.reference.lon);
        expect(ours.altitudeDeg, `${bundle.course_id} altitude at step ${step}`).toBeCloseTo(altitude, 1);
        expect(ours.azimuthDeg, `${bundle.course_id} azimuth at step ${step}`).toBeCloseTo(sun.azimuth_deg[step], 1);
      });
    }
  });

  it("covers race day from the moment it clears the floor to the moment it drops back", () => {
    const sun = nyc.measured.sun!;
    // New York's race day is the morning US clocks go back: 09:10 on the start line is 14:10 UTC.
    expect(sun.first_step).toBe("2026-11-01T07:30:00-05:00");
    expect(sun.floor_deg).toBe(10);
    expect(Math.min(...sun.altitude_deg)).toBeGreaterThanOrEqual(10);
    expect(berlin.measured.sun!.first_step).toBe("2026-09-27T08:15:00+02:00");
  });
});

describe("what the table says about the real courses", () => {
  it("has a row for every course sample", () => {
    for (const bundle of [berlin, nyc]) {
      expect(bundle.measured.sun!.samples).toBe(bundle.measured.course_line.km.length);
    }
  });

  it("finds no shade at all on the bridges, and plenty on an avenue between towers", () => {
    const table = readSunTable(nyc)!;
    // The Verrazzano: two and a half kilometres of open water, 60 m up. Nothing can shade it.
    expect(table.alwaysInSun(sampleAt(nyc, 1.5))).toBe(true);
    // First Avenue in November: the sun is low, and the east side is a wall of buildings.
    expect(table.alwaysInSun(sampleAt(nyc, 27))).toBe(false);
    const onFirstAvenue = sampleAt(nyc, 27);
    const litSteps = [...Array(table.block.steps).keys()].filter((step) => table.inSun(onFirstAvenue, step));
    expect(litSteps.length).toBeGreaterThan(0);
    expect(litSteps.length).toBeLessThan(table.block.steps / 2);
  });

  it("puts the Berlin runner in shade under the Brandenburg Gate, and only there", () => {
    // The course really does run through the gate, whose roof is 21 m over the road (PLAN.md §10):
    // shade at every hour, while the boulevard either side of it has the sun on it most of the day.
    const table = readSunTable(berlin)!;
    const underTheGate = sampleAt(berlin, 41.93);
    const lit = (sample: number) => [...Array(table.block.steps).keys()].filter((step) => table.inSun(sample, step)).length;

    expect(lit(underTheGate)).toBe(0);
    expect(lit(underTheGate - 3)).toBeGreaterThan(table.block.steps / 2);
    expect(lit(underTheGate + 3)).toBeGreaterThan(table.block.steps / 2);
  });

  it("does not take the Queensboro's lower deck for indoors", () => {
    // Three samples at km 25.71-25.73 have a roof 2 m over them: the course is on the lower deck
    // and a building beside the bridge is under it (PLAN.md §10). A roof that low is a footprint
    // overlapping a road it doesn't stand over, not a runner inside a building.
    const table = readSunTable(nyc)!;
    const lit = [...Array(table.block.steps).keys()].filter((step) => table.inSun(sampleAt(nyc, 25.72), step)).length;

    expect(lit).toBeGreaterThan(table.block.steps / 2);
  });

  it("was worked out from more buildings than the White model draws", () => {
    // A tall building reaches the course from far outside the drawn corridor (PLAN.md D58).
    for (const bundle of [berlin, nyc]) {
      const sun = bundle.measured.sun!;
      expect(sun.buildings.counted).toBeGreaterThan(bundle.measured.white_model!.buildings);
      expect(sun.buildings.within_m).toBe(bundle.measured.white_model!.corridor_m);
      expect(sun.buildings.furthest_m).toBeGreaterThan(sun.buildings.within_m);
    }
  });
});

describe("the moment the runner gets there", () => {
  it("changes with the wave, and with the pace, on the same stretch of road", () => {
    const course = madeUpCourse();
    const at600m = (waveId: string, goal: Goal) => sunAlong(course, plannerFor(course, { courseId: "berlin", edition: 2026, waveId, ownStartLocal: null, goal }))!.at(0.6).state;
    const twoHours: Goal = { kind: "finish", seconds: 2 * 3600 };

    // The made-up course falls into shade at 10:00 from halfway on. 600 m in, at a two-hour pace
    // over a one-kilometre course, is an hour and twelve minutes after the start.
    expect(at600m("late", twoHours)).toBe("shade"); // starts 09:00, arrives 10:12
    expect(at600m("early", twoHours)).toBe("sun"); // starts 08:00, arrives 09:12
    expect(at600m("late", { kind: "finish", seconds: 1.5 * 3600 })).toBe("sun"); // arrives 09:54
  });

  it("says nothing was worked out where the runner arrives outside the hours in the table", () => {
    const course = madeUpCourse();
    const plan = (ownStartLocal: string): RacePlan => ({ courseId: "berlin", edition: 2026, waveId: "late", ownStartLocal, goal: { kind: "finish", seconds: 2 * 3600 } });

    // The table stops at 11:00. A runner who sets out at 09:30 is still going at 11:30.
    const afterTheTable = sunAlong(course, plannerFor(course, plan("09:30")))!.at(1.0);
    expect(afterTheTable.state).toBe("unknown");
    expect(afterTheTable.altitudeDeg).toBeGreaterThan(10);
    // And one who sets out in the evening is running in the dark, which the app already says.
    expect(sunAlong(course, plannerFor(course, plan("20:00")))!.at(1.0).state).toBe("down");
  });

  it("is nothing at all when the plan is for another race day than the table", () => {
    const course = madeUpCourse();
    course.editions[0].date.day = "2026-09-28";

    expect(sunAlong(course, plannerFor(course, { courseId: "berlin", edition: 2026, waveId: "late", ownStartLocal: null, goal: { kind: "finish", seconds: 2 * 3600 } }))).toBeNull();
  });

  it("reads the bits back exactly as the pipeline packed them", () => {
    const table = readSunTable(madeUpCourse())!;

    expect(table.inSun(10, 0)).toBe(true); // the first half is in the sun all day
    expect(table.inSun(10, 24)).toBe(true);
    expect(table.inSun(60, 11)).toBe(true); // the second half falls into shade at the twelfth step
    expect(table.inSun(60, 12)).toBe(false);
    expect(table.alwaysInSun(10)).toBe(true);
    expect(table.alwaysInSun(60)).toBe(false);
    expect(table.day).toBe("2026-09-27");
  });
});

describe("the Shade layer", () => {
  const layerFor = (bundle: CourseBundle) => shadeLayer(bundle, plannerFor(bundle, firstWavePlan(bundle)))!;

  it("puts one row on the strip: where the sun is on the road when you get there", () => {
    // One row, not two: the owner had the time-independent one taken out on 09-21. What it said
    // is still in the sentence, where it is true.
    const rows = layerFor(nyc).rows();

    expect(rows.map((row) => row.name)).toEqual(["Shade"]);
    expect(rows[0].scale("km")).toBe("when you get there");
    // The Verrazzano, four minutes in for a four-hour runner: open water and an open sky.
    expect(rows[0].valueAt(1.5, "km")).toEqual({ text: "In the sun", notMeasured: null });
    expect(rows[0].valueAt(27, "km").text).toBe("In shade");
  });

  it("draws nothing dashed on a course where everything is measured", () => {
    // Berlin has no filled-in heights and no hours outside the table for this plan, so nothing on
    // its strip may be dashed or grey. The Sun row hangs from the middle of itself rather than
    // from a value, because a dotted rule across a row reads as "not measured here" (the owner
    // asked what it was, 09-21).
    const [row] = layerFor(berlin).rows();

    expect(row.baseline).toBe("middle");
    expect(row.bins(400).every((bin) => bin.measured && bin.value !== null)).toBe(true);
    expect(layerFor(berlin).lineMarks().every((mark) => mark.encoding === "measured")).toBe(true);
  });

  it("says what the numbers rest on, where the numbers are", () => {
    const [row] = layerFor(berlin).rows();

    expect(row.summary?.("km")).toBe("clear sky, no trees");
    expect(layerFor(berlin).key).toMatch(/clear sky/i);
    expect(layerFor(berlin).key).toMatch(/trees are not in yet/i);
  });

  it("marks the course line in stretches of sun and stretches of shade, and never in percentages", () => {
    const layer = layerFor(nyc);
    const marks = layer.lineMarks();

    expect(marks.length).toBeGreaterThan(20);
    // Warm where the sun is on the runner, teal where a building has them in shade, and grey with
    // no colour at all where the road's own height is filled in.
    expect(new Set(marks.map((mark) => Math.sign(mark.howMuch ?? 0)))).toEqual(new Set([1, 0, -1]));
    expect(marks.filter((mark) => mark.encoding === "not-measured").every((mark) => mark.howMuch === undefined)).toBe(true);
    // Warm where the sun is on the runner, teal where a building has them in shade: the layer
    // says how much and which way, and core/mark-look.ts picks the colour (PLAN.md D47).
    for (const mark of marks) expect(Math.abs(mark.howMuch ?? 0)).toBeLessThanOrEqual(1);
    expect(marks.every((mark) => mark.toKm > mark.fromKm)).toBe(true);
    for (const km of [1.5, 27, 33, 41.5]) expect(layer.clause(km, "km")?.text ?? "").not.toMatch(/%/);
  });

  it("says one plain thing in the sentence: what the sun is doing, and how long it lasts", () => {
    const layer = layerFor(nyc);

    // The Verrazzano is never in shade at any hour, which is the more useful thing to be told —
    // and the distance is that stretch's own, not this moment's sunshine.
    expect(layer.clause(1.5, "km")?.text).toMatch(/^No shade for the next [\d.]+ (m|km), at any hour\.$/);
    expect(layer.clause(2.5, "km")?.text).toBe("No shade for the next 300 m, at any hour."); // to the end of the bridge
    expect(layer.clause(27, "km")?.text).toMatch(/^In (the sun|shade) for the next [\d.]+ (m|km)\.$/);
    expect(layer.clause(27, "mi")?.text).toMatch(/(ft|mi)\./);
    // At the very end of a stretch there is no distance worth printing, and none is printed.
    const course = madeUpCourse();
    const atTheEdge = shadeLayer(course, plannerFor(course, { courseId: "berlin", edition: 2026, waveId: "late", ownStartLocal: null, goal: { kind: "finish", seconds: 2 * 3600 } }))!;
    expect(atTheEdge.clause(0.49, "km")?.text).toBe("No shade, at any hour.");
    // And nowhere along either real course does it come out as a distance of nothing.
    for (const bundle of [berlin, nyc]) {
      const along = layerFor(bundle);
      for (let km = 0; km < 42; km += 0.05) expect(along.clause(km, "km")?.text ?? "", `at km ${km.toFixed(2)}`).not.toMatch(/(^| )0 (m|km|ft|mi)\b/);
    }
    // Every clause here rests on a start time carried over from 2025, and says so.
    expect(layer.clause(27, "km")?.carriedOver).toBe(true);
    expect(shadeLayer(berlin, plannerFor(berlin, firstWavePlan(berlin)))!.clause(27, "km")?.carriedOver).toBe(false);
  });

  it("greys the stretches whose height was filled in, because the shade rests on that height", () => {
    // CLAUDE.md's own trap: a height that was filled in must never look measured, on the map, on
    // the strip or in the sentence. The ray is cast from the road's height, and at a 10° sun ten
    // metres of it move a building's reach by nearly sixty.
    const layer = layerFor(nyc);
    const gaps = nyc.measured.elevation_not_measured;
    const greyed = layer.lineMarks().filter((mark) => mark.encoding === "not-measured");

    expect(greyed.map((mark) => [mark.fromKm, mark.toKm])).toEqual(gaps.map((gap) => [gap.km_start, gap.km_end]));
    // Nothing solid is left lying over one of them.
    for (const solid of layer.lineMarks().filter((mark) => mark.encoding === "measured")) {
      for (const gap of gaps) expect(Math.min(solid.toKm, gap.km_end) - Math.max(solid.fromKm, gap.km_start)).toBeLessThanOrEqual(0);
    }
    // The Verrazzano's unscanned span, on the strip and in the sentence.
    const onTheSpan = (gaps[0].km_start + gaps[0].km_end) / 2;
    expect(layer.rows()[0].valueAt(onTheSpan, "km").notMeasured).toMatch(/filled in, not measured\. Verrazzano/);
    expect(layer.clause(onTheSpan, "km")).toMatchObject({ encoding: "not-measured" });
    expect(layer.rows()[0].bins(400).filter((bin) => !bin.measured).length).toBeGreaterThan(0);
    // Berlin measures every metre of its course, so nothing there is greyed.
    expect(layerFor(berlin).lineMarks().every((mark) => mark.encoding === "measured")).toBe(true);
  });

  it("leaves a hole in the row where there is nothing to say, rather than calling the dark 'shade'", () => {
    // A runner still out after sunset is not in a building's shade: the layer has no value for
    // them, the map marks nothing, and the sentence's own sun clause says the sun is down.
    const course = madeUpCourse();
    const atNight = shadeLayer(course, plannerFor(course, { courseId: "berlin", edition: 2026, waveId: "late", ownStartLocal: "20:00", goal: { kind: "finish", seconds: 2 * 3600 } }))!;

    expect(atNight.rows()[0].valueAt(0.5, "km")).toEqual({ text: "The sun is down", notMeasured: null });
    expect(atNight.rows()[0].bins(100).every((bin) => bin.value === null)).toBe(true);
    expect(atNight.lineMarks()).toEqual([]);
    expect(atNight.clause(0.5, "km")).toBeNull();
  });

  it("greys what it didn't work out, on the strip, on the map and in words", () => {
    const course = madeUpCourse();
    const layer = shadeLayer(course, plannerFor(course, { courseId: "berlin", edition: 2026, waveId: "late", ownStartLocal: "09:30", goal: { kind: "finish", seconds: 2 * 3600 } }))!;
    const clause = layer.clause(1.0, "km");

    expect(clause?.encoding).toBe("not-measured");
    expect(clause?.text).toBe("Shade isn't worked out for this time of day.");
    expect(clause?.note).toMatch(/worked out for race day between 09:00 and 11:00/);
    expect(layer.rows()[0].valueAt(1.0, "km").notMeasured).toMatch(/outside the hours/);
    expect(layer.lineMarks().some((mark) => mark.encoding === "not-measured")).toBe(true);
  });

  it("is not there at all for a course nobody has buildings for", () => {
    const noBuildings = structuredClone(berlin);
    delete noBuildings.measured.sun;

    expect(shadeLayer(noBuildings, plannerFor(noBuildings, firstWavePlan(noBuildings)))).toBeNull();
  });
});

/**
 * A made-up kilometre with a made-up table, so the arithmetic of "when do you get there" can be
 * checked against times worked out on paper: the first half of it is in the sun all morning, and
 * the second half falls into shade at 10:00. The steps run 09:00 to 11:00, five minutes apart.
 */
function madeUpCourse(): CourseBundle {
  const copy = structuredClone(berlin);
  const km = Array.from({ length: 101 }, (_, i) => i / 100);
  const steps = 25;
  const firstStep = "2026-09-27T09:00:00+02:00";
  const rows = km.map((_, sample) => Array.from({ length: steps }, (_, step) => sample < 50 || step < 12));
  const sunAtStep = (step: number) => sunPosition(new Date(Date.parse(firstStep) + step * 5 * 60_000), 52.5, 13.4);

  copy.measured.course_line = {
    spacing_m: 10,
    length_m: 1000,
    km,
    lat: km.map(() => 52.5),
    lon: km.map(() => 13.4),
    elevation_m: km.map(() => 40),
    ellipsoid_height_m: km.map(() => 79.5),
    grade: km.map(() => 0),
    difficulty: km.map(() => 1),
    bearing_deg: km.map(() => 0),
  };
  copy.measured.elevation_not_measured = [];
  copy.measured.sun = {
    step_minutes: 5,
    first_step: firstStep,
    steps,
    samples: km.length,
    floor_deg: 10,
    reference: { lat: 52.5, lon: 13.4 },
    altitude_deg: Array.from({ length: steps }, (_, step) => Number(sunAtStep(step).altitudeDeg.toFixed(2))),
    azimuth_deg: Array.from({ length: steps }, (_, step) => Number(sunAtStep(step).azimuthDeg.toFixed(2))),
    bytes_per_sample: Math.ceil(steps / 8),
    in_sun: pack(rows),
    buildings: { counted: 3, within_m: 150, furthest_m: 2700, reach_per_meter: 5.67 },
  };
  copy.editions = [madeUpEdition()];
  return copy;
}

function madeUpEdition(): Edition {
  const sourced = { source: "https://example.org/race-day", accessed: "2026-09-20" };
  const wave = (id: string, name: string, startLocal: string) => ({ id, name, start_local: startLocal, start: `2026-09-27T${startLocal}:00+02:00`, carried_over: false, ...sourced });
  return { edition: 2026, date: { day: "2026-09-27", confirmed: true, ...sourced }, waves: [wave("early", "Early", "08:00"), wave("late", "Late", "09:00")] };
}

/** The same packing the pipeline writes: one bit per sample and step, sample-major, big end first. */
function pack(rows: boolean[][]): string {
  const bytesPerSample = Math.ceil(rows[0].length / 8);
  const bytes = new Uint8Array(rows.length * bytesPerSample);
  rows.forEach((row, sample) => row.forEach((lit, step) => (bytes[sample * bytesPerSample + (step >> 3)] |= lit ? 128 >> (step & 7) : 0)));
  return btoa(String.fromCharCode(...bytes));
}
