// Seam: a course, a race plan, a kilometre and the layer that is on -> the sentence the runner
// reads. One plain line: what the road is doing, what is near, where the sun is.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { hillsLayer } from "../src/core/hills-layer";
import { NO_LAYERS, onScreen, pressLayer } from "../src/core/layers";
import { createPlanner, defaultPlan, plannerCourse } from "../src/core/planner";
import { placeClause, sentenceAt, sunClause } from "../src/core/sentence";
import { sentenceInWords } from "../src/explore/sentence-view";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

const plannerFor = (bundle: typeof nyc, ownStartLocal: string | null = null) => {
  const course = plannerCourse(bundle);
  return createPlanner(course, { ...defaultPlan(course), ownStartLocal });
};
const words = (clauses: { text: string }[]) => clauses.map((clause) => clause.text).join(" ");

describe("the sentence", () => {
  it("names the grade, the nearby landmark and the side the sun is on, for a known kilometre", () => {
    // New York, km 24.5: the steep part of the climb up the Queensboro Bridge (3.5 to 3.8%
    // there), heading west-north-west (300°) into Manhattan. A 09:10 start and a four-hour goal
    // put the runner there at 11:28 EST on 1 November. Solar noon that day is about 11:40, so the
    // sun is almost due south (176°): 124° round to the runner's left, which is "on your left"
    // and not yet "behind you" (that starts at 135°).
    const hillsOn = onScreen(pressLayer(NO_LAYERS, "hills"), [hillsLayer(nyc)]);
    const sentence = sentenceAt({ bundle: nyc, planner: plannerFor(nyc, "09:10"), km: 24.5, units: "km", layerClause: hillsOn.clause });

    expect(words(sentence)).toBe("Climbing 4%. Ed Koch Queensboro Bridge in 600 m. Sun on your left.");
  });

  it("loses the layer's clause, and nothing else, when the layer is switched off", () => {
    const off = onScreen(NO_LAYERS, [hillsLayer(nyc)]);
    const sentence = sentenceAt({ bundle: nyc, planner: plannerFor(nyc, "09:10"), km: 24.5, units: "km", layerClause: off.clause });

    expect(words(sentence)).toBe("Ed Koch Queensboro Bridge in 600 m. Sun on your left.");
  });

  it("speaks in miles and feet to a runner who thinks in them", () => {
    const sentence = sentenceAt({ bundle: nyc, planner: plannerFor(nyc, "09:10"), km: 24.5, units: "mi", layerClause: () => null });

    expect(words(sentence)).toBe("Ed Koch Queensboro Bridge in 0.4 mi. Sun on your left.");
  });

  it("greys what rests on a carried-over start time, and only that", () => {
    // New York's 2026 wave times are copied from 2025: the sun's position rests on them.
    const carriedOver = sentenceAt({ bundle: nyc, planner: plannerFor(nyc), km: 24.5, units: "km", layerClause: () => null });
    const own = sentenceAt({ bundle: nyc, planner: plannerFor(nyc, "09:10"), km: 24.5, units: "km", layerClause: () => null });

    expect(carriedOver.map((clause) => clause.carriedOver ?? false)).toEqual([false, true]);
    expect(own.map((clause) => clause.carriedOver ?? false)).toEqual([false, false]);
  });

  it("carries a not-measured clause through as not measured, with the reason", () => {
    const hillsOn = onScreen(pressLayer(NO_LAYERS, "hills"), [hillsLayer(nyc)]);
    const [hills] = sentenceAt({ bundle: nyc, planner: plannerFor(nyc, "09:10"), km: 1.0, units: "km", layerClause: hillsOn.clause });

    expect(hills.encoding).toBe("not-measured");
    expect(hills.note).toMatch(/Verrazzano.*straight line/);
  });
});

describe("the place clause", () => {
  const landmarks = [
    { name: "Ed Koch Queensboro Bridge (into Manhattan)", km: 25.1 },
    { name: "First Avenue (north from 60th Street)", km: 26.0 },
  ];

  it("names a landmark the runner is at, without its bracketed aside", () => {
    expect(placeClause(landmarks, 25.0, "km")?.text).toBe("Ed Koch Queensboro Bridge.");
    expect(placeClause(landmarks, 25.3, "km")?.text).toBe("Ed Koch Queensboro Bridge.");
  });

  it("names the next landmark when it is close ahead, and says how far", () => {
    expect(placeClause(landmarks, 24.0, "km")?.text).toBe("Ed Koch Queensboro Bridge in 1.1 km.");
    expect(placeClause(landmarks, 25.6, "km")?.text).toBe("First Avenue in 400 m.");
  });

  it("names the nearest landmark when two are close, not the first on the list", () => {
    // New York's half-marathon mark (km 21.34) is 240 m past the Pulaski Bridge (km 21.1).
    expect(placeClause(nyc.course.landmarks, 21.34, "km")?.text).toBe("Half marathon.");
    expect(placeClause(nyc.course.landmarks, 21.15, "km")?.text).toBe("Pulaski Bridge.");
  });

  it("says nothing when nothing is near: an empty stretch is not news", () => {
    expect(placeClause(landmarks, 10, "km")).toBeNull();
    expect(placeClause(landmarks, 30, "km")).toBeNull();
  });

  it("works on the real courses' landmarks", () => {
    expect(placeClause(berlin.course.landmarks, 41.8, "km")?.text).toBe("Brandenburg Gate.");
  });
});

describe("the sun clause", () => {
  it("says which side the sun is on, from where the runner is facing", () => {
    // Heading north (0°) with the sun in the east-south-east (110°): off to the right.
    expect(sunClause({ altitudeDeg: 25.4, azimuthDeg: 110 }, 0)).toBe("Sun on your right.");
    expect(sunClause({ altitudeDeg: 31, azimuthDeg: 180 }, 180)).toBe("Sun in your eyes.");
    expect(sunClause({ altitudeDeg: 12, azimuthDeg: 250 }, 70)).toBe("Sun behind you.");
    expect(sunClause({ altitudeDeg: 40, azimuthDeg: 90 }, 180)).toBe("Sun on your left.");
  });

  it("says so when the sun is down, instead of giving a side nobody can see", () => {
    expect(sunClause({ altitudeDeg: -3, azimuthDeg: 260 }, 0)).toBe("The sun is down.");
    expect(sunClause({ altitudeDeg: 0, azimuthDeg: 260 }, 0)).toBe("The sun is down.");
  });
});

describe("the sentence, said aloud by the strip's slider", () => {
  it("says what the look shows: that a value is not measured here, that a layer is a sample", () => {
    const spoken = sentenceInWords([
      { text: "Downhill 1%.", encoding: "not-measured", note: "A bridge." },
      { text: "Water in 400 m.", encoding: "sample" },
      { text: "Sun on your right.", encoding: "measured" },
    ]);

    expect(spoken).toBe("Downhill 1%. Not measured here. Water in 400 m. (sample) Sun on your right.");
  });
});
