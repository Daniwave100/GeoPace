// Stops: the places the Ride slows down for (PLAN.md D34, issue #8). A Stop is a landmark, or a
// stretch where something happens: to begin with, the climbs a runner will remember. Later
// layers may add theirs. Pure lookups, no drawing: the Ride, the strip and the Ride's controls
// all ask this module, so they can't disagree about where the Stops are.
import type { CourseBundle } from "../bundle/types";
import { hillStretches } from "./hills";
import { plainName } from "./sentence";
import { formatHeight, formatNearby, type Units } from "./units";

/** Two Stops closer than this are one place: the Ride would arrive at the second before it had left the first. */
const SAME_PLACE_KM = 0.3;
/**
 * A climb gets a Stop of its own when it gains at least this much. New York: the Verrazzano,
 * Lafayette Avenue, the Queensboro and Fifth Avenue, which are the ones runners talk about;
 * Berlin: none, which is also what runners say. (The Hills layer marks every hill from 5 m.)
 */
const CLIMB_WORTH_A_STOP_M = 15;

export interface Stop {
  /** Where the Ride arrives: km from the start along the course line. For a climb, its foot. */
  km: number;
  kind: "start" | "landmark" | "climb" | "finish";
  /** What it is called, in the runner's units: a climb is named by the height it gains. */
  name(units: Units): string;
}

/**
 * The Stops of a course, in course order: the start, every landmark, the big climbs, and the
 * finish. Both ends are always there, so Back and Ride to the next stop can reach them. Every
 * landmark is a Stop, however close to another; anything else gives way to a Stop that already
 * stands on its place (both courses list their finish as a landmark, and the Verrazzano's climb
 * begins at the start).
 */
export function stopsFor(bundle: CourseBundle): Stop[] {
  const lengthKm = bundle.measured.course_line.length_m / 1000;
  const stops = bundle.course.landmarks.map((landmark): Stop => ({ km: landmark.km, kind: "landmark", name: () => landmark.name }));
  const add = (stop: Stop) => {
    if (!stops.some((other) => Math.abs(other.km - stop.km) < SAME_PLACE_KM)) stops.push(stop);
  };
  add({ km: 0, kind: "start", name: () => "Start" });
  add({ km: lengthKm, kind: "finish", name: () => "Finish" });
  for (const hill of hillStretches(bundle)) {
    // A Stop named "Climb of 40 m" is a claim about height. Where any of that height is filled in
    // rather than measured, the number is a guess, and a guess names nothing (PLAN.md D45).
    if (hill.kind === "climb" && hill.gainM >= CLIMB_WORTH_A_STOP_M && hill.notMeasuredKm === 0) add({ km: hill.fromKm, kind: "climb", name: (units) => `Climb of ${formatHeight(hill.gainM, units)}` });
  }
  return stops.sort((a, b) => a.km - b.km);
}

/** Closer to a Stop than this, the runner is on it: two samples of the course line, not a distance anyone rides. */
export const ON_THE_STOP_KM = 0.02;

/** The Stops around a place on the course, by their position in the list; null where there is none. */
export interface StopsAround {
  /** The Stop the runner is on. */
  on: number | null;
  /** Where Back goes: the Stop just passed, or from a Stop, the one before it. */
  back: number | null;
  /** Where Ride to the next stop goes. */
  next: number | null;
}

export function stopsAround(stops: { km: number }[], km: number): StopsAround {
  const on = stops.findIndex((stop) => Math.abs(stop.km - km) <= ON_THE_STOP_KM);
  const next = stops.findIndex((stop) => stop.km > km + ON_THE_STOP_KM);
  // The Stops are in course order, so every Stop before the first one ahead or underfoot is behind.
  const back = (on >= 0 ? on : next >= 0 ? next : stops.length) - 1;
  return { on: on < 0 ? null : on, back: back < 0 ? null : back, next: next < 0 ? null : next };
}

/** Where the Ride is among the Stops, in a line: "Stop 9 of 18: Ed Koch Queensboro Bridge", or "Next stop: Barclays Center, in 7.1 km". */
export function stopLine(stops: Stop[], km: number, units: Units): string {
  const { on, next } = stopsAround(stops, km);
  if (on !== null) return `Stop ${on + 1} of ${stops.length}: ${plainName(stops[on].name(units))}`;
  if (next !== null) return `Next stop: ${plainName(stops[next].name(units))}, in ${formatNearby(stops[next].km - km, units)}`;
  return "";
}
