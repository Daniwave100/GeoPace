// Seam: a Course Bundle's measured course line -> what the Hills layer knows: the height, grade
// and effort at a kilometre, the course binned for the strip, and the climbs and descents worth
// marking on the map. The trap this seam keeps shut: a height that was filled in along a
// straight line must never come out looking measured.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { CourseBundle } from "../src/bundle/types";
import { hillBins, hillsAt, hillStretches } from "../src/core/hills";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);

const berlin = bundleFor("berlin");
const nyc = bundleFor("nyc");

/** A 3 km course: flat for a km, 4% up for a km, 2% down for a km. Samples every 10 m. */
function threeKmCourse(notMeasured: CourseBundle["measured"]["elevation_not_measured"] = []): CourseBundle {
  const km = Array.from({ length: 301 }, (_, i) => i / 100);
  const grade = km.map((at) => (at < 1 ? 0 : at < 2 ? 0.04 : -0.02));
  const elevation: number[] = [];
  km.forEach((_, i) => elevation.push(i === 0 ? 10 : elevation[i - 1] + grade[i - 1] * 10));
  const copy: CourseBundle = structuredClone(berlin);
  copy.measured.course_line = {
    spacing_m: 10,
    length_m: 3000,
    km,
    lat: km.map((at) => 52.5 + at * 0.009),
    lon: km.map(() => 13.4),
    elevation_m: elevation,
    ellipsoid_height_m: elevation.map((height) => height + 39.5),
    grade,
    difficulty: grade.map((g) => 1 + g * 5),
    bearing_deg: km.map(() => 0),
  };
  copy.measured.elevation_not_measured = notMeasured;
  return copy;
}

describe("Hills at a kilometre", () => {
  it("reads height, grade and effort where the runner is", () => {
    const at = hillsAt(threeKmCourse(), 1.5);

    expect(at.elevationM).toBeCloseTo(30, 0);
    expect(at.gradePercent).toBeCloseTo(4, 6);
    expect(at.difficulty).toBeCloseTo(1.2, 6);
    expect(at.notMeasured).toBeNull();
  });

  it("says so, with the reason, where the height is filled in rather than measured", () => {
    const course = threeKmCourse([{ km_start: 1.2, km_end: 1.6, reason: "Test bridge: a straight line." }]);

    expect(hillsAt(course, 1.4).notMeasured).toBe("Test bridge: a straight line.");
    expect(hillsAt(course, 1.2).notMeasured).not.toBeNull(); // the ends belong to the stretch
    expect(hillsAt(course, 1.1).notMeasured).toBeNull();
    expect(hillsAt(course, 1.7).notMeasured).toBeNull();
  });

  it("flags the crest of the Verrazzano, the highest point of the New York course, as not measured", () => {
    expect(hillsAt(nyc, 1.0).notMeasured).toMatch(/Verrazzano/);
    expect(hillsAt(nyc, 5.0).notMeasured).toBeNull();
    // Berlin's bridge decks are read from the city's surface model: nothing there is filled in.
    expect(hillsAt(berlin, 6.62).notMeasured).toBeNull(); // on the Moltkebrücke
    expect(hillsAt(berlin, 10).notMeasured).toBeNull();
  });
});

describe("Hills binned for the strip", () => {
  it("covers the whole course, end to end, with no gaps between bins", () => {
    const bins = hillBins(nyc, 200);

    expect(bins).toHaveLength(200);
    expect(bins[0].startKm).toBe(0);
    expect(bins[199].endKm).toBeCloseTo(nyc.measured.course_line.length_m / 1000, 6);
    bins.slice(1).forEach((bin, i) => expect(bin.startKm).toBeCloseTo(bins[i].endKm, 9));
  });

  it("marks a bin as not measured if any part of it is filled in", () => {
    const course = threeKmCourse([{ km_start: 1.2, km_end: 1.6, reason: "Test bridge." }]);
    const bins = hillBins(course, 30); // 100 m bins

    expect(bins.filter((bin) => !bin.measured).map((bin) => bin.startKm.toFixed(1))).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5"]);
  });

  it("drops the effort of a whole bin when any grade in it is outside the model, rather than averaging a hole away", () => {
    const course = threeKmCourse();
    course.measured.course_line.difficulty[155] = null;
    const bins = hillBins(course, 30);

    expect(bins[15].difficulty).toBeNull();
    expect(bins[14].difficulty).not.toBeNull();
  });
});

describe("climbs and descents", () => {
  it("finds each sustained hill, with how far, how high and how steep", () => {
    const [climb, descent] = hillStretches(threeKmCourse());

    expect(climb).toMatchObject({ kind: "climb" });
    expect(climb.fromKm).toBeCloseTo(1, 1);
    expect(climb.toKm).toBeCloseTo(2, 1);
    expect(climb.gainM).toBeCloseTo(40, 0);
    expect(climb.meanGradePercent).toBeCloseTo(4, 0);
    expect(descent).toMatchObject({ kind: "descent" });
    expect(descent.gainM).toBeCloseTo(-20, 0);
    expect(descent.meanGradePercent).toBeCloseTo(-2, 0);
  });

  it("ignores rises too small for a runner to call a hill", () => {
    const course = threeKmCourse();
    // 1.5% for 100 m: 1.5 m of height.
    course.measured.course_line.grade = course.measured.course_line.km.map((at) => (at >= 1 && at < 1.1 ? 0.015 : 0));
    course.measured.course_line.elevation_m = course.measured.course_line.km.map((at) => 10 + Math.min(Math.max(at - 1, 0), 0.1) * 15);

    expect(hillStretches(course)).toEqual([]);
  });

  it("says how much of a hill rests on filled-in height", () => {
    const course = threeKmCourse([{ km_start: 1.5, km_end: 2.5, reason: "Test bridge." }]);
    const [climb, descent] = hillStretches(course);

    expect(climb.notMeasuredKm).toBeCloseTo(0.5, 1);
    expect(descent.notMeasuredKm).toBeCloseTo(0.5, 1);
    expect(hillStretches(threeKmCourse())[0].notMeasuredKm).toBe(0);
  });

  it("finds New York's bridges and almost nothing in Berlin, which is what runners say", () => {
    const newYork = hillStretches(nyc);
    const biggest = [...newYork].sort((a, b) => Math.abs(b.gainM) - Math.abs(a.gainM)).slice(0, 4);

    // The four biggest: down off the Verrazzano (the race starts partway up it, so its climb is
    // the smaller side), up and down the Queensboro, and the long drag up Fifth Avenue.
    expect(biggest[0]).toMatchObject({ kind: "descent" });
    expect(biggest[0].toKm).toBeLessThan(3);
    expect(biggest.filter((hill) => hill.fromKm > 23 && hill.toKm < 27).map((hill) => hill.kind)).toEqual(["climb", "descent"]);
    expect(biggest.filter((hill) => hill.fromKm > 36.5 && hill.toKm < 39).map((hill) => hill.kind)).toEqual(["climb"]);
    expect(hillStretches(berlin).length).toBeLessThan(5);
    expect(newYork.length).toBeGreaterThan(10);
    // In course order, never overlapping.
    newYork.slice(1).forEach((hill, i) => expect(hill.fromKm).toBeGreaterThanOrEqual(newYork[i].toKm));
  });
});
