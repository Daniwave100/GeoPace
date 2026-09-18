// Seam: a Course Bundle + a race plan -> the content all three mockups render.
//
// The mockups exist to choose a look, so most of their layers are placeholders for pipelines that
// aren't built yet (#9–#13). The rule this seam has to keep is the project's third principle:
// measured data and invented data must never be presentable as the same thing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { buildStory, certifiedKmToLineKm } from "../src/mockups/story";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);

const berlin = bundleFor("berlin");
const nyc = bundleFor("nyc");
const FOUR_HOURS = 4 * 3600;

describe("mockup story", () => {
  it("labels every invented layer as sample, and never labels a measured one that way", () => {
    const story = buildStory(berlin, { goalFinishSeconds: FOUR_HOURS });
    const sampleness = Object.fromEntries(story.layers.map((layer) => [layer.id, layer.sample]));

    // Real, from the pipeline, with sources in the bundle.
    expect(sampleness.elevation).toBe(false);
    expect(sampleness.difficulty).toBe(false);
    expect(sampleness.landmarks).toBe(false);
    // Stand-ins until their pipelines exist.
    expect(sampleness.exposure).toBe(true);
    expect(sampleness.wind).toBe(true);
    expect(sampleness.aid).toBe(true);
    expect(sampleness.gps).toBe(true);

    // And each one says which kind of data it is, so the two never share an encoding.
    const kinds = Object.fromEntries(story.layers.map((layer) => [layer.id, layer.provenance]));
    expect(kinds.elevation).toBe("measured");
    expect(kinds.gps).toBe("subjective");
  });

  it("reads the real measured course at a scrubbed kilometre", () => {
    const story = buildStory(nyc, { goalFinishSeconds: FOUR_HOURS });
    const line = nyc.measured.course_line;
    const index = line.km.findIndex((km) => km >= 25);

    const readout = story.at(line.km[index]);

    expect(readout.elevationM).toBeCloseTo(line.elevation_m[index], 6);
    expect(readout.headingDeg).toBeCloseTo(line.bearing_deg[index], 6);
    // The Queensboro Bridge really is up in the air.
    expect(readout.elevationM).toBeGreaterThan(20);
  });

  it("hands back nothing rather than a guess where the difficulty model doesn't apply", () => {
    // Neither real course gets near the Minetti model's ±45% limit, so the blank case has to be
    // staged. It still has to work: a missing value must never reach the screen as a number.
    const steep = structuredClone(nyc);
    const line = steep.measured.course_line;
    const cliff = line.km.findIndex((km) => km >= 25);
    line.difficulty[cliff] = null;

    const story = buildStory(steep, { goalFinishSeconds: FOUR_HOURS });

    expect(story.at(line.km[cliff]).difficulty).toBeNull();
    // ...and it takes the whole bin down with it, rather than averaging a hole away.
    const bin = story.strip(100).find((candidate) => candidate.startKm <= line.km[cliff] && line.km[cliff] < candidate.endKm);
    expect(bin?.difficulty).toBeNull();
  });

  it("refuses to present the Verrazzano's filled-in elevation as measured", () => {
    // PLAN.md §10, still open: the bridge's main span has no LiDAR return at all, so its height is
    // a straight line drawn between the last real measurements either side. The Course Bundle has
    // no field that can say so, which means the app would happily draw it as fact.
    const story = buildStory(nyc, { goalFinishSeconds: FOUR_HOURS });

    expect(story.at(1.1).elevationMeasured).toBe(false);
    expect(story.at(5).elevationMeasured).toBe(true);
    // The gap travels with a reason and a source, like any other claim about the world.
    expect(story.unmeasured[0].reason).toMatch(/LiDAR/i);
    expect(story.sources.some((source) => source.id === story.unmeasured[0].sourceId)).toBe(true);

    // Berlin's decks are spanned deliberately (D18) and its terrain is measured throughout.
    expect(buildStory(berlin, { goalFinishSeconds: FOUR_HOURS }).at(1.1).elevationMeasured).toBe(true);
  });

  it("puts organizer kilometres onto the course line's own scale", () => {
    // PLAN.md D20: the certified 42.195 km and the traced line are different scales, and mixing
    // them once put the finish marker 90 m early. An aid station at the organizer's 5 km sits a
    // little further along a line that measures 42.69 km.
    const lineKm = certifiedKmToLineKm(5, nyc);

    expect(lineKm).toBeCloseTo(5 * (42688.2 / 42195), 6);
    expect(lineKm).toBeGreaterThan(5);
    // The half-marathon landmark the pipeline already placed this way agrees.
    const half = nyc.course.landmarks.find((landmark) => landmark.name === "Half marathon");
    expect(certifiedKmToLineKm(21.0975, nyc)).toBeCloseTo(half?.km ?? 0, 1);
  });
});
