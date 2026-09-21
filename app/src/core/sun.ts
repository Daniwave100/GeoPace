// The Sun layer's data: for every 10 m of road, is the sun on it at the moment the runner gets
// there? Binary, never a share (PLAN.md D58) — "60% of this kilometre" was an artefact of
// chopping the course into kilometres, and what a runner can picture is sun, shade, sun, shade.
//
// The answer itself is worked out in the pipeline, from the city's own buildings and the sun's
// own geometry, and arrives as one bit per sample and per five minutes of race day. All this
// module does is pick the moment: the runner's wave and pace say when they reach each sample, so
// changing either moves every bit of the course into a different column of the same table.
//
// Four answers, not two, because the table only covers the hours worth modelling:
//   • in the sun, or in shade — the table's own answer, measured;
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

export type SunState = "sun" | "shade" | "unknown" | "down";

/** The table as the bundle carries it, unpacked enough to ask questions of. */
export interface SunTable {
  block: SunBlock;
  /** The local calendar day it was worked out for, YYYY-MM-DD. */
  day: string;
  firstStepMs: number;
  stepMs: number;
  /** The step nearest a moment, or null when it is outside the hours the pipeline modelled. */
  stepAt(ms: number): number | null;
  /** Whether the sun reaches this sample at this step. */
  inSun(sample: number, step: number): boolean;
  /** Whether it reaches this sample at every step: the bridges and the wide avenues. */
  alwaysInSun(sample: number): boolean;
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
  const firstStepMs = Date.parse(block.first_step);
  const stepMs = block.step_minutes * 60_000;
  const inSun = (sample: number, step: number) => (bits[sample * block.bytes_per_sample + (step >> 3)] & (128 >> (step & 7))) !== 0;
  return {
    block,
    day: block.first_step.slice(0, 10),
    firstStepMs,
    stepMs,
    stepAt(ms) {
      const step = Math.round((ms - firstStepMs) / stepMs);
      return step >= 0 && step < block.steps ? step : null;
    },
    inSun,
    alwaysInSun(sample) {
      for (let step = 0; step < block.steps; step += 1) if (!inSun(sample, step)) return false;
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
    states.push(step === null ? outsideTheHours(ms, line.lat[sample], line.lon[sample]) : table.inSun(sample, step) ? "sun" : "shade");
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
