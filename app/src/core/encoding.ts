// The four ways GeoPace draws a claim, so a runner can tell at a glance how much to trust it
// (PLAN.md principle 3, and the Race poster's encodings in §6). One table drives every surface:
// the strip's marks and the words in the sentence take `cssClass` (style.css draws it), and the
// course line on the map takes `mapLine` (scene/course-marks.ts draws it). A layer never picks a
// colour or a dash pattern of its own; it says which kind of claim it is making.

export type Encoding = "measured" | "runner-report" | "not-measured" | "sample";

export interface EncodingLook {
  /** What it is called on screen. */
  name: string;
  /** What it means, in a line, for the key. */
  meaning: string;
  /** The class on a strip mark or on words in text. */
  cssClass: string;
  /** How a stretch of the course line is drawn on the map. */
  mapLine: "solid" | "hollow" | "grey-dashes" | "stripes";
  /** Words added after a statement of this kind, for a reader (or a screen reader) who can't rely on the look. */
  saidAfter: string;
}

export const ENCODINGS: Record<Encoding, EncodingLook> = {
  measured: {
    name: "Solid is measured",
    meaning: "Surveyed, or worked out from a survey by a published model.",
    cssClass: "enc-measured",
    mapLine: "solid",
    saidAfter: "",
  },
  "runner-report": {
    name: "Hollow is what runners say",
    meaning: "Worth knowing, never checked, never mixed into a number.",
    cssClass: "enc-runner-report",
    mapLine: "hollow",
    saidAfter: "",
  },
  "not-measured": {
    name: "Grey, dashed or struck through is not measured here",
    meaning: "The survey has nothing at this spot, so the value is filled in and says so.",
    cssClass: "enc-not-measured",
    mapLine: "grey-dashes",
    saidAfter: "Not measured here.",
  },
  sample: {
    name: "Stripes are a sample",
    meaning: "An invented stand-in for a layer that isn't built. It says nothing about the course.",
    cssClass: "enc-sample",
    mapLine: "stripes",
    saidAfter: "(sample)",
  },
};
