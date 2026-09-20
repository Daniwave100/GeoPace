// The White model's own file: the city's real buildings along the course, as blocks. It is
// written beside the Course Bundle, which names it, because a marathon's worth of building
// outlines is many times everything else about a course put together (schema/white-model.schema.json).
//
// It is fetched after the bundle and never waited for: the course, the strip, the plan and the
// Ride are all on screen before it arrives, and if it never does, the map is what is left.
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../schema/white-model.schema.json";

export const SUPPORTED_WHITE_MODEL_VERSION = 1;
const MAX_LISTED_PROBLEMS = 8;

export class WhiteModelError extends Error {
  override name = "WhiteModelError";
}

/** Parallel columns: index i of every column describes the same block. */
export interface Blocks {
  /** The ground the block stands on, in metres above the WGS84 ellipsoid. */
  base_m: number[];
  /** Its flat top, in metres above the WGS84 ellipsoid. */
  roof_m: number[];
  /** Its outline as lon, lat, lon, lat… in degrees, going round once, the first point not repeated. */
  ring: number[][];
}

export interface WhiteModel {
  schema_version: 1;
  course_id: string;
  generated_at: string;
  pipeline_version: string;
  /** How far either side of the course a building had to be to be kept. */
  corridor_m: number;
  /** How far a point of an outline was allowed to sit from its wall before it was dropped. */
  simplified_m: number;
  buildings: Blocks;
  sources: { id: string; title: string; url: string; licence: string; accessed: string; note?: string }[];
  /** Shown whenever the buildings are on screen. The bundle carries these too. */
  attributions: { text: string; url: string }[];
}

const validate = new Ajv2020({ allErrors: true, allowUnionTypes: true }).compile<WhiteModel>(schema);

export async function loadWhiteModel(courseId: string, file: string, fetchFn: typeof fetch = fetch): Promise<WhiteModel> {
  const url = `/${courseId}/${file}`;
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new WhiteModelError(`Couldn't load the buildings for "${courseId}" from ${url} (HTTP ${response.status}). Rebuild them with: cd pipeline && uv run geopace build ${courseId}`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  return parseWhiteModel(data, courseId);
}

export function parseWhiteModel(data: unknown, courseId: string): WhiteModel {
  const rebuild = `cd pipeline && uv run geopace build ${courseId}`;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new WhiteModelError(`The buildings for "${courseId}" are not a White model (expected a JSON object).`);
  }
  const version = (data as { schema_version?: unknown }).schema_version;
  if (version !== SUPPORTED_WHITE_MODEL_VERSION) {
    throw new WhiteModelError(`The buildings for "${courseId}" are in format version ${String(version)}, but this app reads version ${SUPPORTED_WHITE_MODEL_VERSION}. Update the app, or rebuild the data with: ${rebuild}`);
  }
  const problems = validate(data) ? blockProblems(data) : (validate.errors ?? []).map(describe);
  if (problems.length > 0) {
    const listed = problems.slice(0, MAX_LISTED_PROBLEMS).map((p) => `  • ${p}`);
    if (problems.length > MAX_LISTED_PROBLEMS) listed.push(`  • …and ${problems.length - MAX_LISTED_PROBLEMS} more`);
    throw new WhiteModelError(`The buildings for "${courseId}" don't match the White model format:\n${listed.join("\n")}\nRebuild them with: ${rebuild}`);
  }
  return data as WhiteModel;
}

/** Things JSON Schema can't express: every column has one value per block, and a roof is over its base. */
function blockProblems(model: WhiteModel): string[] {
  const { base_m, roof_m, ring } = model.buildings;
  if (new Set([base_m.length, roof_m.length, ring.length]).size > 1) {
    return [`buildings columns have different lengths (base_m=${base_m.length}, roof_m=${roof_m.length}, ring=${ring.length})`];
  }
  const inside_out = roof_m.findIndex((roof, i) => roof < base_m[i]);
  if (inside_out >= 0) return [`buildings[${inside_out}] has its roof (${roof_m[inside_out]} m) below its base (${base_m[inside_out]} m)`];
  const odd = ring.findIndex((points) => points.length % 2 !== 0);
  return odd >= 0 ? [`buildings.ring[${odd}] has ${ring[odd].length} numbers, which is not a whole number of lon/lat pairs`] : [];
}

function describe(error: ErrorObject): string {
  const path = error.instancePath === "" ? "the White model" : error.instancePath.split("/").slice(1).join(".");
  if (error.keyword === "required") return `${path} is missing "${(error.params as { missingProperty: string }).missingProperty}"`;
  if (error.keyword === "additionalProperties") return `${path} has an unexpected field "${(error.params as { additionalProperty: string }).additionalProperty}"`;
  return `${path} ${error.message ?? "is invalid"}`;
}
