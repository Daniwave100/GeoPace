// The Shade layer's data: for every 10 m of road, is the sun on it at the moment the runner gets
// there? Binary, never a share (PLAN.md D58) — "60% of this kilometre" was an artefact of
// chopping the course into kilometres, and what a runner can picture is sun, shade, sun, shade.
//
// The answer itself is worked out in the pipeline, from the city's own buildings and the sun's
// own geometry, and arrives as one bit per sample and per five minutes of race day. All this
// module does is pick the moment: the runner's wave and pace say when they reach each sample, so
// changing either moves every bit of the course into a different column of the same table.
//
// Three states where the table has an answer, and two more where it hasn't (PLAN.md D58, D60):
//   • in the sun, in shade, or in leafy shade — the table's own answer, measured. Leafy shade is
//     shade a tree casts: the runner gets it while the leaves are on and not otherwise, which is
//     the whole reason it is a state of its own and not more teal. A building's shade wins
//     wherever both apply, because shade you get whatever the trees do is the stronger claim;
//   • unknown — the moment is outside the table. Almost always because the sun is under the floor
//     the pipeline works shade out above, where a street is in shadow whatever anyone computes;
//     it can also be the far side of midnight, if a runner types in a start time late enough.
//     Either way nobody worked it out, so it is shown as a filled-in value, never as a
//     measurement, and the words say which of the two it is;
//   • the sun is down — which the sentence already says on its own.
import type { CourseBundle, SunBlock } from "../bundle/types";
import type { Planner } from "./planner";
import { nearestIndex } from "./series";
import { sunPosition } from "./solar";

export type SunState = "sun" | "shade" | "leafy" | "unknown" | "down";

/** The table as the bundle carries it, unpacked enough to ask questions of. */
export interface SunTable {
  block: SunBlock;
  /** The local calendar day it was worked out for, YYYY-MM-DD. */
  day: string;
  firstStepMs: number;
  stepMs: number;
  /** The step nearest a moment, or null when it is outside the hours the pipeline modelled. */
  stepAt(ms: number): number | null;
  /** Whether the sun reaches this sample at this step, past every building. */
  inSun(sample: number, step: number): boolean;
  /** Whether a tree's crown stops it where the buildings didn't. Always false with no tree data. */
  inLeafShade(sample: number, step: number): boolean;
  /** Whether the road here is unshaded at every step: neither wall nor leaf, at any hour we model. */
  alwaysInSun(sample: number): boolean;
  /** Whether this course has tree data at all — not whether any of it ended up shading anything. */
  hasTrees: boolean;
}

/** What the sun is doing where the runner is. */
export interface SunAt {
  state: SunState;
  /** Where this stretch of sun or shade gives way to the other, in km along the course line. */
  untilKm: number;
  /** In the sun at every hour the pipeline modelled: no shade here whenever you come past. */
  alwaysInSun: boolean;
  /** Where that stretch of never-shaded road ends. Only meaningful while `alwaysInSun`. */
  alwaysUntilKm: number;
  /** How high the sun is where the runner is, in degrees. Negative when it is down. */
  altitudeDeg: number;
}

/** A stretch of the course in one state, for the marks on the map. */
export interface SunRun {
  fromKm: number;
  toKm: number;
  state: SunState;
}

/** The whole course for one runner's plan: what the sun is doing at every sample, when they reach it. */
export interface SunAlong {
  table: SunTable;
  /** One per course-line sample, in course order. */
  states: SunState[];
  alwaysInSun: boolean[];
  runs: SunRun[];
  at(km: number): SunAt;
}

export function readSunTable(bundle: CourseBundle): SunTable | null {
  const block = bundle.measured.sun;
  if (!block) return null;
  const bits = decode(block.in_sun);
  const leafBits = block.in_leaf_shade === undefined ? null : decode(block.in_leaf_shade);
  const firstStepMs = Date.parse(block.first_step);
  const stepMs = block.step_minutes * 60_000;
  const bitAt = (from: Uint8Array, sample: number, step: number) => (from[sample * block.bytes_per_sample + (step >> 3)] & (128 >> (step & 7))) !== 0;
  const inSun = (sample: number, step: number) => bitAt(bits, sample, step);
  const inLeafShade = (sample: number, step: number) => leafBits !== null && bitAt(leafBits, sample, step);
  return {
    block,
    // What the table was worked out from, not what it found: a course whose trees happen never to
    // reach the road still has trees, and the layer should say so rather than "no trees".
    hasTrees: block.trees !== undefined,
    day: block.first_step.slice(0, 10),
    firstStepMs,
    stepMs,
    stepAt(ms) {
      // Only inside the hours the table covers. Rounding alone would answer from the first or
      // last column for a moment up to half a step outside them — where the sun is under the
      // floor and the whole point is that nobody worked it out.
      if (ms < firstStepMs || ms > firstStepMs + (block.steps - 1) * stepMs) return null;
      return Math.round((ms - firstStepMs) / stepMs);
    },
    inSun,
    inLeafShade,
    alwaysInSun(sample) {
      // A road under trees is not a road with no shade: the leaves count in the strongest claim
      // this layer makes, "no shade here at any hour".
      for (let step = 0; step < block.steps; step += 1) if (!inSun(sample, step) || inLeafShade(sample, step)) return false;
      return true;
    },
  };
}

/**
 * The course as this runner will meet it. null when the bundle has no sun table, or when its
 * table is for another race day than the plan's edition: an answer for the wrong day is worse
 * than no answer, and without one the layer doesn't exist.
 */
export function sunAlong(bundle: CourseBundle, planner: Planner): SunAlong | null {
  const table = readSunTable(bundle);
  if (!table || table.day !== planner.edition.date.day) return null;
  const line = bundle.measured.course_line;
  const states: SunState[] = [];
  const alwaysInSun: boolean[] = [];
  for (let sample = 0; sample < line.km.length; sample += 1) {
    const ms = planner.instantAtKm(line.km[sample]).getTime();
    const step = table.stepAt(ms);
    states.push(step === null ? outsideTheHours(ms, line.lat[sample], line.lon[sample]) : stateAt(table, sample, step));
    alwaysInSun.push(table.alwaysInSun(sample));
  }
  const runs = runsOf(states, line.km);
  // The same stretches again for the time-independent column, so the sentence can say how far the
  // never-shaded road runs rather than how far this moment's sunshine does.
  const alwaysRuns = runsOf(
    alwaysInSun.map((always) => (always ? "sun" : "shade")),
    line.km,
  );
  return {
    table,
    states,
    alwaysInSun,
    runs,
    at(km) {
      const sample = nearestIndex(line.km, km);
      const run = runs[runAt(runs, km)];
      const always = alwaysRuns[runAt(alwaysRuns, km)];
      const instant = planner.instantAtKm(km);
      return {
        // The run's own state, not the nearest sample's: within a few metres of a shadow's edge
        // the two can differ, and the sentence must not say "in the sun until here".
        state: run.state,
        untilKm: run.toKm,
        alwaysInSun: always.state === "sun",
        alwaysUntilKm: always.toKm,
        altitudeDeg: sunPosition(instant, line.lat[sample], line.lon[sample]).altitudeDeg,
      };
    },
  };
}

/** Sun, shade or leafy shade at one sample and one moment. A wall beats a leaf. */
function stateAt(table: SunTable, sample: number, step: number): SunState {
  if (!table.inSun(sample, step)) return "shade";
  return table.inLeafShade(sample, step) ? "leafy" : "sun";
}

/** The moment is outside the table: the sun is under the horizon, or nobody worked this one out. */
function outsideTheHours(ms: number, lat: number, lon: number): SunState {
  return sunPosition(new Date(ms), lat, lon).altitudeDeg <= 0 ? "down" : "unknown";
}

function runsOf(states: SunState[], km: number[]): SunRun[] {
  const runs: SunRun[] = [];
  states.forEach((state, sample) => {
    const current = runs[runs.length - 1];
    const toKm = km[Math.min(sample + 1, km.length - 1)];
    if (current && current.state === state) current.toKm = toKm;
    else runs.push({ fromKm: km[sample], toKm, state });
  });
  return runs;
}

/** Which run a km falls in: the last one that starts at or before it. */
function runAt(runs: SunRun[], km: number): number {
  let found = 0;
  for (let i = 0; i < runs.length && runs[i].fromKm <= km; i += 1) found = i;
  return found;
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
