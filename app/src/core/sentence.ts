// The sentence: the one plain line saying what the course is doing where the runner is. It is a
// list of short clauses, each a complete statement: the clause of the layer that is on (PLAN.md
// D35), then what is near, then where the sun is. "Climbing 3%. Ed Koch Queensboro Bridge in
// 600 m. Sun behind you."
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
  /** The clause of whichever layer is on (`onScreen(...).clause`); returns null when none is. */
  layerClause(km: number, units: Units): Clause | null;
}

export function sentenceAt({ bundle, planner, km, units, layerClause }: SentenceInput): Clause[] {
  const readout = planner.at(km);
  const place = positionAtKm(bundle.measured.course_line, readout.km);
  const sun: Clause = {
    text: sunClause(sunPosition(readout.instant, place.lat, place.lon), place.bearingDeg),
    encoding: "measured",
    // The sun is where it is at a time of day, and the time of day rests on the start time.
    carriedOver: planner.carriedOver !== null,
  };
  return [layerClause(readout.km, units), placeClause(bundle.course.landmarks, readout.km, units), sun].filter((clause) => clause !== null);
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
