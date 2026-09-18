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
      expect(bundle.editions.length).toBeGreaterThan(0);
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

  it("rejects edition facts that would hide a carried-over time or run a clock from nothing", () => {
    const unflagged = pipelineBundle();
    unflagged.editions[0].waves[0].carried_over = true; // ...with no edition.carried_over to say from when, or why
    expect(rejectionOf(unflagged)).toContain('editions[0] is missing "carried_over"');

    const noInstant = pipelineBundle();
    noInstant.editions[0].waves[0].start = null; // a wall-clock time without the instant it means
    expect(rejectionOf(noInstant)).toContain("editions[0].waves[0].start must be a string");
  });

  it("rejects a bundle that doesn't say where its heights are filled in, rather than reading it as all measured", () => {
    const silent = pipelineBundle();
    delete silent.measured.elevation_not_measured;
    expect(rejectionOf(silent)).toContain('measured is missing "elevation_not_measured"');
  });

  it("rejects a bundle from a different format version with advice instead of a list of errors", () => {
    const older = { ...pipelineBundle(), schema_version: 3 };

    const message = rejectionOf(older);
    expect(message).toContain("format version 3");
    expect(message).toContain("version 4");
    expect(message).not.toContain("must be");
  });

  it("rejects a bundle without the height above the ellipsoid, rather than drawing the course at a guess", () => {
    const silent = pipelineBundle();
    delete silent.measured.course_line.ellipsoid_height_m;
    expect(rejectionOf(silent)).toContain('measured.course_line is missing "ellipsoid_height_m"');

    const short = pipelineBundle();
    short.measured.course_line.ellipsoid_height_m.pop();
    expect(rejectionOf(short)).toMatch(/different lengths/);
  });

  it("carries the height above the ellipsoid for every sample: below sea level's in New York, above it in Berlin", () => {
    // Sea level is about 32.5 m under the ellipsoid in New York and 39.5 m over it in Berlin.
    for (const [course, from, to] of [["nyc", -33.2, -32.3], ["berlin", 39.3, 39.9]] as const) {
      const line = parseCourseBundle(JSON.parse(committed(course)), course).measured.course_line;
      expect(line.ellipsoid_height_m.length).toBe(line.km.length);
      const seaLevel = line.ellipsoid_height_m.map((height, i) => height - line.elevation_m[i]);
      expect(Math.min(...seaLevel)).toBeGreaterThan(from);
      expect(Math.max(...seaLevel)).toBeLessThan(to);
    }
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
