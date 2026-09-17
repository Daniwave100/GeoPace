// Seam: Course Bundle (as written by the pipeline) -> Bundle loader.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BundleError, loadCourseBundle, parseCourseBundle } from "../src/bundle/loader";

// The committed bundles, produced by `uv run geopace build <course>`.
const committed = (course: string) => readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8");
const berlinJson = committed("berlin");
const pipelineBundle = (): any => JSON.parse(berlinJson);

function rejectionOf(data: unknown): string {
  try {
    parseCourseBundle(data, "berlin");
  } catch (err) {
    expect(err).toBeInstanceOf(BundleError);
    return (err as Error).message;
  }
  throw new Error("expected the bundle to be rejected");
}

describe("Course Bundle loader", () => {
  it("loads a pipeline-produced bundle cleanly", () => {
    const bundle = parseCourseBundle(pipelineBundle(), "berlin");

    expect(bundle.course.timezone).toBe("Europe/Berlin");
    const line = bundle.measured.course_line;
    expect(line.km.length).toBeGreaterThan(4000);
    expect(line.elevation_m.length).toBe(line.km.length);
    expect(bundle.attributions.length).toBeGreaterThan(0);
  });

  it("loads every committed course, so the picker can switch between them", () => {
    for (const course of ["berlin", "nyc"]) {
      const bundle = parseCourseBundle(JSON.parse(committed(course)), course);

      expect(bundle.course_id).toBe(course);
      expect(bundle.course.landmarks.length).toBeGreaterThan(0);
      expect(bundle.measured.course_line.km.length).toBeGreaterThan(4000);
    }
  });

  it("rejects a malformed bundle and names each problem", () => {
    const bad = pipelineBundle();
    bad.measured.course_line.grade[3] = "steep";
    delete bad.course.timezone;

    const message = rejectionOf(bad);
    expect(message).toMatch(/berlin/);
    expect(message).toContain("measured.course_line.grade[3] must be a number");
    expect(message).toContain('course is missing "timezone"');
  });

  it("rejects a bundle from a different format version with advice instead of a list of errors", () => {
    const newer = { ...pipelineBundle(), schema_version: 2 };

    const message = rejectionOf(newer);
    expect(message).toContain("format version 2");
    expect(message).toContain("version 1");
    expect(message).not.toContain("must be");
  });

  it("rejects columns that don't line up sample for sample", () => {
    const bad = pipelineBundle();
    bad.measured.course_line.grade.pop();

    expect(rejectionOf(bad)).toMatch(/different lengths/);
  });

  it("rejects something that isn't a bundle at all", () => {
    expect(rejectionOf("<html>Not found</html>")).toMatch(/not a Course Bundle/);
  });

  it("explains a missing bundle file", async () => {
    const notFound = async () => new Response("nope", { status: 404 });

    await expect(loadCourseBundle("nyc", notFound)).rejects.toThrow(
      /\/nyc\/course-bundle\.json.*404.*geopace build nyc/s,
    );
  });
});
