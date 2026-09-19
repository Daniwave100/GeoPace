// Stops: the places the Ride slows down for (PLAN.md D34, issue #8). A Stop is a landmark, or a
// stretch where something happens: to begin with, the climbs a runner will remember. Later
// layers may add theirs. Pure lookups, no drawing: the Ride, the strip and the Ride's controls
// all ask this module, so they can't disagree about where the Stops are.
import type { CourseBundle } from "../bundle/types";
import { hillStretches } from "./hills";
import { plainName } from "./sentence";
import { formatHeight, formatNearby, type Units } from "./units";

/** A climb that begins this close to a Stop is not a Stop of its own: the Ride would arrive at it before it had left the other. That Stop takes the climb's end instead. */
const SAME_PLACE_KM = 0.3;
/**
 * Closer to a Stop than this, the runner is on it. Half of the 50 m that a distance to the next
 * Stop is rounded to (core/units.ts), so a runner who is not yet on a Stop is never told it is 0 m away.
 */
export const ON_THE_STOP_KM = 0.025;
/**
 * A climb gets a Stop of its own when it gains at least this much. New York: the Verrazzano,
 * Lafayette Avenue, the Queensboro and Fifth Avenue, which are the ones runners talk about;
 * Berlin: none, which is also what runners say. (The Hills layer marks every hill from 5 m.)
 */
const CLIMB_WORTH_A_STOP_M = 15;

export interface Stop {
  /** Where the Ride arrives: km from the start along the course line. For a climb, its foot. */
  km: number;
  /**
   * Where the stretch that begins here ends: the Ride stays slow all the way through it. A place
   * has none, unless a stretch begins at it: New York's Start stands at the foot of the Verrazzano's climb.
   */
  toKm?: number;
  kind: "start" | "landmark" | "climb" | "finish";
  /** What it is called, in the runner's units: a climb is named by the height it gains. */
  name(units: Units): string;
}

/**
 * The Stops of a course, in course order: the start, every landmark, the big climbs, and the
 * finish. Every landmark is a Stop, however close to another. Both ends are always Stops, so Back
 * and Ride to the next stop can reach them: an end is only left out where a landmark stands on
 * it and so is that end already (both courses list their finish as a landmark). A climb gives way
 * to any Stop near its foot (the Verrazzano's begins at the start).
 */
export function stopsFor(bundle: CourseBundle): Stop[] {
  const lengthKm = bundle.measured.course_line.length_m / 1000;
  const stops = bundle.course.landmarks.map((landmark): Stop => ({ km: landmark.km, kind: "landmark", name: () => landmark.name }));
  const addAnEnd = (stop: Stop) => {
    if (!stops.some((other) => Math.abs(other.km - stop.km) <= ON_THE_STOP_KM)) stops.push(stop);
  };
  addAnEnd({ km: 0, kind: "start", name: () => "Start" });
  addAnEnd({ km: lengthKm, kind: "finish", name: () => "Finish" });
  for (const hill of hillStretches(bundle)) {
    // A Stop named "Climb of 40 m" is a claim about height. Where any of that height is filled in
    // rather than measured, the number is a guess, and a guess names nothing (PLAN.md D45).
    if (hill.kind !== "climb" || hill.gainM < CLIMB_WORTH_A_STOP_M || hill.notMeasuredKm !== 0) continue;
    // A climb that gives way to a Stop at its foot is still slow all the way up: that Stop keeps its name and takes the climb's end.
    const atItsFoot = stops.find((other) => Math.abs(other.km - hill.fromKm) <= SAME_PLACE_KM);
    if (atItsFoot) atItsFoot.toKm ??= hill.toKm;
    else stops.push({ km: hill.fromKm, toKm: hill.toKm, kind: "climb", name: (units) => `Climb of ${formatHeight(hill.gainM, units)}` });
  }
  return stops.sort((a, b) => a.km - b.km);
}

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
