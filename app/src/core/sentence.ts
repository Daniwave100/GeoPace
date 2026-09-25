// The sentence: the one plain line saying what the course is doing where the runner is. It is a
// list of short clauses, each a complete statement: one from each layer that is on, in the
// layers' order (PLAN.md D35, D62), then what is near, then where the sun is. "Climbing 3%. In
// shade for the next 200 m. Ed Koch Queensboro Bridge in 600 m. Sun behind you."
//
// Landmarks are their own clause rather than worked into the grammar of another ("onto the…",
// "at the…"): their names are hand-maintained facts, some are phrases ("Leaves the park at Grand
// Army Plaza"), and a name on its own always reads right.
import type { CourseBundle } from "../bundle/types";
import { sunOnRunner } from "./bearing";
import type { Clause } from "./layers";
import type { Planner } from "./planner";
import { positionAtKm } from "./scrub";
import { type SunPosition, sunPosition } from "./solar";
import { formatNearby, type Units } from "./units";

/** Closer than this, the runner is at the landmark. */
const AT_KM = 0.25;
/** A landmark further ahead than this isn't news yet. */
const AHEAD_KM = 1.5;

export interface SentenceInput {
  bundle: CourseBundle;
  planner: Planner;
  km: number;
  units: Units;
  /** The clauses of the layers that are on, in their order (`onScreen(...).clauses`); empty when none is. */
  layerClauses(km: number, units: Units): Clause[];
}

export function sentenceAt({ bundle, planner, km, units, layerClauses }: SentenceInput): Clause[] {
  const readout = planner.at(km);
  return [...layerClauses(readout.km, units), placeClause(bundle.course.landmarks, readout.km, units), sunAt(bundle, planner, readout.km)].filter((clause): clause is Clause => clause !== null);
}

/**
 * How long the sentence stays up while a Ride plays (PLAN.md D68). The owner, 09-24: "It changes so
 * fast that a user does not have the opportunity to actually even read it." Four seconds is a
 * sentence of fifteen words at an ordinary reading pace. It is real time, the same at every speed:
 * at 4× a beat covers four times the road, and says less that is particular about it.
 */
export const BEAT_SECONDS = 4;

/** Whether the sentence that went up at `startedMs` has been up for its beat. null: none is up yet. */
export function beatIsDue(startedMs: number | null, nowMs: number): boolean {
  return startedMs === null || nowMs - startedMs >= BEAT_SECONDS * 1000;
}

export interface StretchInput {
  bundle: CourseBundle;
  planner: Planner;
  /** The stretch a beat covers: from where the runner is to where the Ride will have them when it ends. */
  fromKm: number;
  toKm: number;
  units: Units;
  /** The clauses of the layers that are on for the stretch (`onScreen(...).stretchClauses`). */
  layerClauses(fromKm: number, toKm: number, units: Units): Clause[];
}

/**
 * The sentence for a stretch a Ride is about to cover: each layer's clause for it, the landmark it
 * passes, and the side the sun is on, every one of them true of the whole stretch, since it stays
 * up while the Ride covers it. Something that changes inside the stretch is said as changing ("in
 * and out of the shade") or left out (the sun, as the course turns), never said for half the beat.
 */
export function sentenceAlong({ bundle, planner, fromKm, toKm, units, layerClauses }: StretchInput): Clause[] {
  const line = bundle.measured.course_line;
  const to = Math.min(Math.max(toKm, fromKm), line.km[line.km.length - 1]);
  return [...layerClauses(fromKm, to, units), placePassed(bundle.course.landmarks, fromKm, to), sunAlongStretch(bundle, planner, fromKm, to)].filter((clause): clause is Clause => clause !== null);
}

/** The sun where the runner is, at the moment their plan puts them there. */
function sunAt(bundle: CourseBundle, planner: Planner, km: number): Clause {
  const readout = planner.at(km);
  const place = positionAtKm(bundle.measured.course_line, readout.km);
  return {
    text: sunClause(sunPosition(readout.instant, place.lat, place.lon), place.bearingDeg),
    encoding: "measured",
    // The sun is where it is at a time of day, and the time of day rests on the start time.
    carriedOver: planner.carriedOver !== null,
  };
}

/** Where along a stretch the sun is looked at: every so often, and at both ends. */
const SUN_LOOKED_AT_EVERY_KM = 0.1;

/** The side the sun is on, if it stays there for the whole stretch; null where the course turns it round. */
function sunAlongStretch(bundle: CourseBundle, planner: Planner, fromKm: number, toKm: number): Clause | null {
  const looks = Math.max(1, Math.ceil((toKm - fromKm) / SUN_LOOKED_AT_EVERY_KM));
  const first = sunAt(bundle, planner, fromKm);
  for (let look = 1; look <= looks; look += 1) {
    if (sunAt(bundle, planner, fromKm + ((toKm - fromKm) * look) / looks).text !== first.text) return null;
  }
  return first;
}

/**
 * The landmark a stretch passes, or starts at, by name. Where it is, the Ride shows: the runner
 * gets there while the sentence is up, and "in 600 m" would be wrong before it was read.
 */
export function placePassed(landmarks: { name: string; km: number }[], fromKm: number, toKm: number): Clause | null {
  const passed = landmarks.find((landmark) => landmark.km >= fromKm - AT_KM && landmark.km <= toKm);
  return passed ? { text: `${plainName(passed.name)}.`, encoding: "measured" } : null;
}

/**
 * The landmark the runner is at (the nearest one, where two are close: New York's half-marathon
 * mark is 240 m past the Pulaski Bridge), or the next one if it is close ahead; null when nothing
 * is near. A landmark is a sourced fact, not a measurement, but the poster has no fifth look for
 * those (PLAN.md D28): like everything that isn't hearsay, a filled-in value or a sample, it is solid.
 */
export function placeClause(landmarks: { name: string; km: number }[], km: number, units: Units): Clause | null {
  const at = landmarks.filter((landmark) => Math.abs(landmark.km - km) <= AT_KM).sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))[0];
  if (at) return { text: `${plainName(at.name)}.`, encoding: "measured" };
  const next = landmarks.find((landmark) => landmark.km > km && landmark.km - km <= AHEAD_KM);
  return next ? { text: `${plainName(next.name)} in ${formatNearby(next.km - km, units)}.`, encoding: "measured" } : null;
}

/** "Sun on your right." From where the runner is, facing the way they run. */
export function sunClause(sun: SunPosition, headingDeg: number): string {
  if (sun.altitudeDeg <= 0) return "The sun is down.";
  const side = sunOnRunner(headingDeg, sun.azimuthDeg).side;
  return side === "ahead" ? "Sun in your eyes." : side === "behind" ? "Sun behind you." : `Sun on your ${side}.`;
}

/** A landmark's name without its bracketed aside: "First Avenue (north from 60th Street)" is "First Avenue". */
export function plainName(name: string): string {
  return name.replace(/\s*\(.*\)$/, "");
}
