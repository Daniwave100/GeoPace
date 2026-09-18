// Seam: a course story + a kilometre -> the fields and entries every design prints.
// The designs only decide how these look, so the honesty has to be settled here: a filled-in
// value says it is filled in, and hearsay arrives labelled as hearsay.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { entriesNear, layerFields } from "../src/mockups/content";
import { buildStory } from "../src/mockups/story";

const nyc = buildStory(
  parseCourseBundle(JSON.parse(readFileSync(new URL("../../data/derived/nyc/course-bundle.json", import.meta.url), "utf8")), "nyc"),
  { goalFinishSeconds: 4 * 3600 },
);

describe("mockup content", () => {
  it("says in words that the Verrazzano's mid-span height is not measured", () => {
    const onTheSpan = layerFields(nyc, nyc.at(1.1)).find((field) => field.key === "elevation");
    const inBrooklyn = layerFields(nyc, nyc.at(10)).find((field) => field.key === "elevation");

    expect(onTheSpan?.unknown).toBe(true);
    expect(onTheSpan?.unknownNote).toBe("not measured here");
    expect(inBrooklyn?.unknown).toBeFalsy();
    expect(inBrooklyn?.unknownNote).toBeUndefined();
  });

  it("hands runner reports over as subjective samples with a plain heading", () => {
    const report = entriesNear(nyc, 1.1).find((entry) => entry.kind === "note");

    expect(report?.provenance).toBe("subjective");
    expect(report?.sample).toBe(true);
    expect(report?.title).toBe("Watch trouble");
  });

  it("gives measured landmarks a source, and never gives a placeholder one", () => {
    for (const entry of entriesNear(nyc, 24)) {
      if (entry.kind === "landmark") expect(entry.source).toMatch(/^https?:\/\//);
      if (entry.sample) expect(entry.source).toBeUndefined();
    }
  });
});
