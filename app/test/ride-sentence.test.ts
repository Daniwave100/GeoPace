// Seam: the sentence while a Ride plays (PLAN.md D68). A course, a race plan and the stretch of
// course a beat covers -> the sentence that stays up for that beat. The owner, 09-24: "It changes
// so fast that a user does not have the opportunity to actually even read it." So in a Ride the
// sentence changes in beats, and what it says must be true of the whole stretch the Ride covers
// while it is up: no countdown ("in 1.7 km", "for the next 50 m"), which is stale before it is read.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { aidLayer } from "../src/core/aid-layer";
import { hillsLayer } from "../src/core/hills-layer";
import { type Clause, type Layer, NO_LAYERS, onScreen, pressLayer } from "../src/core/layers";
import { createPlanner, defaultPlan, plannerCourse } from "../src/core/planner";
import { BEAT_SECONDS, beatIsDue, sentenceAlong } from "../src/core/sentence";
import { shadeLayer } from "../src/core/shade-layer";
import { sunAlong } from "../src/core/sun";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const berlin = bundleFor("berlin");

const plannerFor = (bundle: typeof nyc, ownStartLocal: string | null = null) => {
  const course = plannerCourse(bundle);
  return createPlanner(course, { ...defaultPlan(course), ownStartLocal });
};
const words = (clauses: Clause[]) => clauses.map((clause) => clause.text).join(" ");
/** A number of metres, kilometres, feet or miles still to go: what a beat must never say. */
const COUNTDOWN = /\bin [\d.]+ ?(m|km|ft|mi)\b|for the next/;

const everyLayer = (bundle: typeof nyc) => {
  const planner = plannerFor(bundle, "09:10");
  const layers = [hillsLayer(bundle), shadeLayer(bundle, planner), aidLayer(bundle, planner)].filter((layer): layer is Layer => layer !== null);
  const on = layers.reduce((state, layer) => pressLayer(state, layer.id), NO_LAYERS);
  return { planner, layers, screen: onScreen(on, layers) };
};

describe("the Ride's beat", () => {
  it("is long enough to read a sentence, and the same at every speed", () => {
    expect(BEAT_SECONDS).toBeGreaterThanOrEqual(3);
    expect(beatIsDue(null, 1000)).toBe(true);
    expect(beatIsDue(1000, 1000 + BEAT_SECONDS * 1000 - 1)).toBe(false);
    expect(beatIsDue(1000, 1000 + BEAT_SECONDS * 1000)).toBe(true);
  });
});

describe("the sentence for a stretch of the Ride", () => {
  it("never counts down, anywhere on either course, with every layer on", () => {
    for (const bundle of [berlin, nyc]) {
      const { planner, screen } = everyLayer(bundle);
      for (let km = 0; km < 42; km += 0.37) {
        const sentence = sentenceAlong({ bundle, planner, fromKm: km, toKm: km + 1.8, units: "km", layerClauses: screen.stretchClauses });
        expect(words(sentence), `${bundle.course_id} from km ${km.toFixed(2)}`).not.toMatch(COUNTDOWN);
      }
    }
  });

  it("names a landmark the stretch passes, and not one beyond it", () => {
    // Potsdamer Platz is at km 38.6 of Berlin's course facts.
    const passing = sentenceAlong({ bundle: berlin, planner: plannerFor(berlin), fromKm: 38.2, toKm: 39.0, units: "km", layerClauses: () => [] });
    const before = sentenceAlong({ bundle: berlin, planner: plannerFor(berlin), fromKm: 37.0, toKm: 37.8, units: "km", layerClauses: () => [] });

    expect(words(passing)).toMatch(/^Potsdamer Platz\.( |$)/);
    expect(words(before)).not.toMatch(/Potsdamer Platz/);
  });

  it("says where the sun is only while it stays on that side for the whole stretch", () => {
    const { planner } = everyLayer(berlin);
    for (let km = 0; km < 42; km += 0.5) {
      const sun = sentenceAlong({ bundle: berlin, planner, fromKm: km, toKm: km + 1.8, units: "km", layerClauses: () => [] }).at(-1);
      if (sun && /^Sun /.test(sun.text)) {
        // The side named holds at both ends of the stretch.
        const [start] = sentenceAlong({ bundle: berlin, planner, fromKm: km, toKm: km, units: "km", layerClauses: () => [] }).slice(-1);
        const [end] = sentenceAlong({ bundle: berlin, planner, fromKm: km + 1.8, toKm: km + 1.8, units: "km", layerClauses: () => [] }).slice(-1);
        expect(start.text, `from km ${km}`).toBe(sun.text);
        expect(end.text, `to km ${km + 1.8}`).toBe(sun.text);
      }
    }
  });
});

describe("each layer's clause for a stretch", () => {
  it("Aid: the station the stretch passes, by name, or the next one by where it is", () => {
    const aid = aidLayer(berlin, plannerFor(berlin))!;

    expect(aid.stretchClause(8.8, 9.4, "km")?.text).toBe("Water, a sports drink, tea and fruit at the 9 km station.");
    expect(aid.stretchClause(8.8, 9.4, "km")?.note).toMatch(/Maurten DRINK MIX 160/);
    expect(aid.stretchClause(36.5, 37.0, "km")?.text).toMatch(/^Water at 38 km\.$/);
    expect(aid.stretchClause(41.0, 41.8, "km")?.text).toBe("No more aid stations.");
  });

  it("Hills: the hill the stretch is on, with its own grade and length, or flat where there is none", () => {
    const hills = hillsLayer(nyc);

    // The climb onto the Queensboro Bridge, New York km 24.2 to 24.8.
    expect(hills.stretchClause(24.3, 24.6, "km")?.text).toMatch(/^Climbing [\d.]+% for [\d.]+ (m|km)\.$/);
    expect(hillsLayer(berlin).stretchClause(10, 11, "km")?.text).toBe("Flat.");
  });

  it("Hills: a hill's clause looks as the hill's label on the map does, on both courses", () => {
    // Greyed where more than half the hill is filled in, with the reason whenever any of it is
    // (D45): the Queensboro Bridge's climb is all measured, and was struck through for a whole
    // beat because the stretch ran on to the gaps in its lower deck (the owner's video, 09-25).
    for (const bundle of [berlin, nyc]) {
      const hills = hillsLayer(bundle);
      for (const label of hills.lineLabels()) {
        const clause = hills.stretchClause(label.startKm, label.startKm + 0.01, "km");
        expect(clause?.encoding, `${bundle.course_id} hill from km ${label.startKm}`).toBe(label.encoding);
        expect(clause?.note !== undefined, `${bundle.course_id} hill from km ${label.startKm}`).toBe(label.note !== undefined);
      }
    }
    expect(hillsLayer(nyc).stretchClause(23.7, 25.5, "km")).toMatchObject({ encoding: "measured", note: undefined });
    expect(hillsLayer(nyc).stretchClause(1.0, 2.0, "km")?.note).toMatch(/Verrazzano/);
  });

  it("Hills: flat, greyed where more than half of the stretch is filled in", () => {
    // Between the Verrazzano's climb (to km 0.72) and its descent (from 0.86), most of it the
    // unscanned main span (from 0.77).
    const clause = hillsLayer(nyc).stretchClause(0.73, 0.85, "km");

    expect(clause?.text).toBe("Flat.");
    expect(clause?.encoding).toBe("not-measured");
    expect(clause?.note).toMatch(/Verrazzano/);
  });

  it("Shade: one state where the stretch stays in it, and in and out where it doesn't", () => {
    const planner = plannerFor(berlin);
    const shade = shadeLayer(berlin, planner)!;
    const runs = sunAlong(berlin, planner)!.runs;
    const long = runs.find((run) => (run.state === "sun" || run.state === "shade") && run.toKm - run.fromKm > 0.4)!;
    const changing = runs.find((run, i) => run.state === "sun" && runs[i + 1]?.state === "shade" && run.toKm - run.fromKm > 0.05)!;

    expect(shade.stretchClause(long.fromKm + 0.05, long.toKm - 0.05, "km")?.text).toBe(long.state === "sun" ? "In the sun." : "In shade.");
    expect(shade.stretchClause(changing.toKm - 0.04, changing.toKm + 0.04, "km")?.text).toBe("In and out of the shade.");
  });

  it("Shade: greyed only where more than half of the stretch is filled in, with the reason where any is", () => {
    const planner = plannerFor(nyc, "09:10");
    const shade = shadeLayer(nyc, planner)!;

    // The Queensboro's approach and the first 250 m of its lower deck's gaps: mostly measured.
    const mostly = shade.stretchClause(24.9, 25.4, "km");
    expect(mostly?.encoding).not.toBe("not-measured");
    expect(mostly?.note).toMatch(/filled in/);
    // Most of it the Verrazzano's unscanned main span.
    expect(shade.stretchClause(0.8, 1.2, "km")?.encoding).toBe("not-measured");
  });

  it("Shade: a tree's shade is still a claim that depends on the leaves", () => {
    const planner = plannerFor(berlin);
    const shade = shadeLayer(berlin, planner)!;
    const leafy = sunAlong(berlin, planner)!.runs.find((run) => run.state === "leafy" && run.toKm - run.fromKm > 0.1)!;

    const clause = shade.stretchClause(leafy.fromKm + 0.02, leafy.toKm - 0.02, "km");
    expect(clause?.text).toBe("In leafy shade.");
    expect(clause?.encoding).toBe("depends-on-leaves");
  });
});
