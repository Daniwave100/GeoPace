// Seam: a Course Bundle -> the Stops the Ride slows down for (issue #8): the start, every
// landmark, and the climbs a runner will remember. Read from the real bundles, so a change in
// either course that loses a landmark, or names a Stop after a guessed height, fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { CourseBundle } from "../src/bundle/types";
import { stopLine, stopsAround, stopsFor } from "../src/core/stops";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

/** A 3 km course: flat for a km, 4% up for a km (40 m), 2% down for a km. One landmark, in the middle of the flat. */
function threeKmCourse(notMeasured: CourseBundle["measured"]["elevation_not_measured"] = []): CourseBundle {
  const km = Array.from({ length: 301 }, (_, i) => i / 100);
  const grade = km.map((at) => (at < 1 ? 0 : at < 2 ? 0.04 : -0.02));
  const elevation: number[] = [];
  km.forEach((_, i) => elevation.push(i === 0 ? 10 : elevation[i - 1] + grade[i - 1] * 10));
  const copy: CourseBundle = structuredClone(berlin);
  copy.course.landmarks = [{ name: "The fountain", km: 0.5, source: "https://example.org/fountain" }];
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

describe("the Stops of a course", () => {
  it("include every landmark, in course order", () => {
    for (const bundle of [nyc, berlin]) {
      const stops = stopsFor(bundle);
      const landmarks = stops.filter((stop) => stop.kind === "landmark");

      expect(landmarks.map((stop) => stop.name("km"))).toEqual(bundle.course.landmarks.map((landmark) => landmark.name));
      expect(landmarks.map((stop) => stop.km)).toEqual(bundle.course.landmarks.map((landmark) => landmark.km));
      const kms = stops.map((stop) => stop.km);
      expect(kms).toEqual([...kms].sort((a, b) => a - b));
    }
  });

  it("begin at the start and end at the finish, so Back and Ride to the next stop can reach both ends", () => {
    for (const bundle of [nyc, berlin]) {
      const stops = stopsFor(bundle);

      expect(stops[0].km).toBe(0);
      expect(stops[0].kind).toBe("start");
      expect(stops[0].name("km")).toBe("Start");
      expect(stops[stops.length - 1].km).toBeCloseTo(bundle.measured.course_line.length_m / 1000, 2);
      expect(stops[stops.length - 1].name("km")).toMatch(/^Finish/);
    }
  });

  it("add the climbs a runner will remember: three in New York besides the Verrazzano's, which begins at the start, and none in flat Berlin", () => {
    const climbs = stopsFor(nyc).filter((stop) => stop.kind === "climb");

    // Lafayette Avenue after the Barclays Center, the Queensboro Bridge, and Fifth Avenue up to the park.
    expect(climbs.map((stop) => Number(stop.km.toFixed(1)))).toEqual([12.5, 23.5, 37.0]);
    expect(climbs[1].name("km")).toBe("Climb of 38 m");
    expect(climbs[1].name("mi")).toBe("Climb of 125 ft");
    expect(stopsFor(berlin).filter((stop) => stop.kind === "climb")).toEqual([]);
  });

  it("never name a Stop after a height that was filled in", () => {
    const names = (bundle: CourseBundle) => stopsFor(bundle).map((stop) => stop.name("km"));

    expect(names(threeKmCourse())).toEqual(["Start", "The fountain", "Climb of 40 m", "Finish"]);
    // The same climb over a bridge whose deck nobody scanned: its 40 m is a guess, so it names nothing.
    expect(names(threeKmCourse([{ km_start: 1.4, km_end: 1.6, reason: "The scan has a gap here." }]))).toEqual(["Start", "The fountain", "Finish"]);
  });
});

describe("the Stops around the runner", () => {
  const stops = [{ km: 0 }, { km: 0.9 }, { km: 12.1 }, { km: 42.69 }];

  it("between two Stops: Back is the one just passed, next is the one ahead", () => {
    expect(stopsAround(stops, 5)).toEqual({ on: null, back: 1, next: 2 });
  });

  it("on a Stop: Back is the one before it, and a hair's width either side is still on it", () => {
    expect(stopsAround(stops, 0.9)).toEqual({ on: 1, back: 0, next: 2 });
    expect(stopsAround(stops, 0.91)).toEqual({ on: 1, back: 0, next: 2 });
    expect(stopsAround(stops, 0.89)).toEqual({ on: 1, back: 0, next: 2 });
  });

  it("at the two ends there is nothing further", () => {
    expect(stopsAround(stops, 0)).toEqual({ on: 0, back: null, next: 1 });
    expect(stopsAround(stops, 42.688)).toEqual({ on: 3, back: 2, next: null });
  });
});

describe("the line that says where the Ride is among the Stops", () => {
  const stops = stopsFor(nyc);

  it("names the Stop the runner is on, and counts it", () => {
    expect(stopLine(stops, 0, "km")).toBe("Stop 1 of 18: Start");
    expect(stopLine(stops, 25.1, "km")).toBe("Stop 9 of 18: Ed Koch Queensboro Bridge");
    expect(stopLine(stops, 42.688, "mi")).toBe("Stop 18 of 18: Finish");
  });

  it("between Stops, names the next one and how far it is, in the runner's units", () => {
    expect(stopLine(stops, 5, "km")).toBe("Next stop: Barclays Center, in 7.1 km");
    expect(stopLine(stops, 5, "mi")).toBe("Next stop: Barclays Center, in 4.4 mi");
    expect(stopLine(stops, 23, "mi")).toBe("Next stop: Climb of 125 ft, in 0.3 mi");
  });
});
