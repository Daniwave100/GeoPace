// Bundle loader: fetches a Course Bundle and refuses anything that doesn't match the schema,
// with a message a person can act on. Catching drift here keeps a stale or broken bundle from
// silently drawing wrong numbers.
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../schema/course-bundle.schema.json";
import type { CourseBundle } from "./types";

export const SUPPORTED_SCHEMA_VERSION = 4;
const MAX_LISTED_PROBLEMS = 8;

export class BundleError extends Error {
  override name = "BundleError";
}

const validate = new Ajv2020({ allErrors: true, allowUnionTypes: true }).compile<CourseBundle>(schema);

function bundleUrl(courseId: string): string {
  return `/${courseId}/course-bundle.json`;
}

export async function loadCourseBundle(courseId: string, fetchFn: typeof fetch = fetch): Promise<CourseBundle> {
  const url = bundleUrl(courseId);
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new BundleError(
      `Couldn't load the course data for "${courseId}" from ${url} (HTTP ${response.status}). ` +
        `Has the pipeline written data/derived/${courseId}/? Run: cd pipeline && uv run geopace build ${courseId}`,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  return parseCourseBundle(data, courseId);
}

export function parseCourseBundle(data: unknown, courseId: string): CourseBundle {
  const rebuild = `cd pipeline && uv run geopace build ${courseId}`;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BundleError(`The course data for "${courseId}" is not a Course Bundle (expected a JSON object).`);
  }

  const version = (data as { schema_version?: unknown }).schema_version;
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new BundleError(
      `The course data for "${courseId}" is in format version ${String(version)}, but this app reads ` +
        `version ${SUPPORTED_SCHEMA_VERSION}. Update the app, or rebuild the data with: ${rebuild}`,
    );
  }

  const problems = validate(data) ? columnProblems(data) : (validate.errors ?? []).map(describe);
  if (problems.length > 0) {
    const listed = problems.slice(0, MAX_LISTED_PROBLEMS).map((p) => `  • ${p}`);
    if (problems.length > MAX_LISTED_PROBLEMS) listed.push(`  • …and ${problems.length - MAX_LISTED_PROBLEMS} more`);
    throw new BundleError(
      `The course data for "${courseId}" doesn't match the Course Bundle format:\n${listed.join("\n")}\n` +
        `Rebuild it with: ${rebuild}`,
    );
  }
  return data as CourseBundle;
}

/** Things JSON Schema can't express: every column has one value per sample, and km increases. */
function columnProblems(bundle: CourseBundle): string[] {
  const line = bundle.measured.course_line;
  const columns = ["lat", "lon", "km", "elevation_m", "ellipsoid_height_m", "grade", "difficulty", "bearing_deg"] as const;
  const lengths = columns.map((name) => `${name}=${line[name].length}`);
  if (new Set(columns.map((name) => line[name].length)).size > 1) {
    return [`measured.course_line columns have different lengths (${lengths.join(", ")})`];
  }
  const i = line.km.findIndex((km, idx) => idx > 0 && km <= line.km[idx - 1]);
  if (i > 0) return [`measured.course_line.km must increase, but km[${i}] = ${line.km[i]} follows ${line.km[i - 1]}`];
  return sunProblems(bundle, line.km.length);
}

/**
 * The sun table is read by indexing into its bits (core/sun.ts), and an index past the end of a
 * Uint8Array is `undefined`, which reads as 0, which reads as "in shade". So a truncated or
 * mis-strided table would draw a made-up sun and shade over the whole course, as measured fact.
 * These are the same things the pipeline checks before it writes one (bundle.py).
 */
function sunProblems(bundle: CourseBundle, samples: number): string[] {
  const sun = bundle.measured.sun;
  if (!sun) return [];
  const problems: string[] = [];
  if (sun.samples !== samples) problems.push(`measured.sun covers ${sun.samples} samples but the course line has ${samples}`);
  for (const name of ["altitude_deg", "azimuth_deg"] as const) {
    if (sun[name].length !== sun.steps) problems.push(`measured.sun.${name} has ${sun[name].length} values for ${sun.steps} steps`);
  }
  if (sun.bytes_per_sample !== Math.ceil(sun.steps / 8)) {
    problems.push(`measured.sun.bytes_per_sample is ${sun.bytes_per_sample}, but ${sun.steps} steps need ${Math.ceil(sun.steps / 8)}`);
  }
  const wanted = sun.samples * sun.bytes_per_sample;
  // Both columns of bits are read the same way and are the same size. A short leafy column would
  // read as "no trees here", which is at least quiet; a mis-strided one would put a tree's shade
  // where there is no tree, and the runner would be told it while the leaves are on.
  for (const column of ["in_sun", "in_leaf_shade"] as const) {
    const packed = sun[column];
    if (packed === undefined) continue;
    const bytes = bytesInBase64(packed);
    if (bytes !== wanted) problems.push(`measured.sun.${column} is ${bytes} bytes, but ${sun.samples} samples of ${sun.bytes_per_sample} bytes need ${wanted}`);
  }
  return problems;
}

/** How many bytes a base64 string stands for, without decoding it. */
function bytesInBase64(text: string): number {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return Math.floor((text.length / 4) * 3) - padding;
}

function describe(error: ErrorObject): string {
  const path = readablePath(error.instancePath);
  switch (error.keyword) {
    case "required":
      return `${path} is missing "${(error.params as { missingProperty: string }).missingProperty}"`;
    case "additionalProperties":
      return `${path} has an unexpected field "${(error.params as { additionalProperty: string }).additionalProperty}"`;
    case "type":
      return `${path} must be ${article((error.params as { type: string | string[] }).type)}`;
    default:
      return `${path} ${error.message ?? "is invalid"}`;
  }
}

function article(type: string | string[]): string {
  const names = Array.isArray(type) ? type : [type];
  return names.map((t) => (/^[aeiou]/.test(t) ? `an ${t}` : `a ${t}`)).join(" or ");
}

/** "/measured/course_line/grade/3" -> "measured.course_line.grade[3]" */
function readablePath(pointer: string): string {
  if (pointer === "") return "the bundle";
  return pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((path, part) => (/^\d+$/.test(part) ? `${path}[${part}]` : path ? `${path}.${part}` : part), "");
}
