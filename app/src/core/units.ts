// Kilometres or miles: the one place a number is converted for the runner (PLAN.md D42).
//
// Everything inside GeoPace stays metric: the Course Bundle, the Planner and the scrubbing
// arithmetic are in meters, seconds and km from the start. A number is converted only where it is
// shown or typed, and only here, so a later layer follows the switch just by formatting with this
// module. Switching units therefore can't change a plan: a 4:00:00 goal is 4:00:00 either way.

/** What the runner thinks in. Heights follow: metres with kilometres, feet with miles. */
export type Units = "km" | "mi";

export const UNITS: Units[] = ["km", "mi"];
export const DEFAULT_UNITS: Units = "km";

/** Exact by definition (the international mile and foot, 1959), not measurements. */
export const KM_PER_MILE = 1.609344;
export const M_PER_FOOT = 0.3048;

const FEET_PER_MILE = 5280;

export const kmToMiles = (km: number): number => km / KM_PER_MILE;
export const milesToKm = (miles: number): number => miles * KM_PER_MILE;
export const metersToFeet = (meters: number): number => meters / M_PER_FOOT;
export const feetToMeters = (feet: number): number => feet * M_PER_FOOT;

/** Anything stored that isn't a unit (an older version's storage, a typo) is kilometres. */
export function sanitizeUnits(candidate: unknown): Units {
  return candidate === "mi" ? "mi" : DEFAULT_UNITS;
}

/** How long one of the runner's units is, in km: the length of a big keyboard step, a splits row. */
export function unitKm(units: Units): number {
  return units === "mi" ? KM_PER_MILE : 1;
}

/** "kilometre" or "mile", for labels and for what a screen reader says. */
export function unitName(units: Units, count: "one" | "many" = "one"): string {
  const name = units === "mi" ? "mile" : "kilometre";
  return count === "one" ? name : `${name}s`;
}

/** A distance along the course as a bare number in the shown unit: "21.10". */
export function distanceNumber(km: number, units: Units, digits = 2): string {
  return (km / unitKm(units)).toFixed(digits);
}

/** "21.10 km" or "13.11 mi". */
export function formatDistance(km: number, units: Units, digits = 2): string {
  return `${distanceNumber(km, units, digits)} ${units}`;
}

/** A height as a bare whole number in the shown unit: the data is good to about a metre. */
export function heightNumber(meters: number, units: Units): number {
  const value = Math.round(units === "mi" ? metersToFeet(meters) : meters);
  return value === 0 ? 0 : value; // never -0
}

/** A height, or a climb: "78 m" or "256 ft". */
export function formatHeight(meters: number, units: Units): string {
  return `${heightNumber(meters, units)} ${heightUnit(units)}`;
}

/** "m" or "ft": the unit a height scale is labelled in. */
export function heightUnit(units: Units): string {
  return units === "mi" ? "ft" : "m";
}

/**
 * A distance to something close by, the way a runner would say it: round, and in the small unit
 * when it is close. "400 m", "1.2 km"; "350 ft", "0.3 mi".
 */
export function formatNearby(km: number, units: Units): string {
  if (units === "mi") {
    const miles = kmToMiles(km);
    if (miles < 0.1) return `${Math.round((miles * FEET_PER_MILE) / 50) * 50} ft`;
    return `${miles.toFixed(1)} mi`;
  }
  const meters = Math.round((km * 1000) / 50) * 50;
  return meters < 1000 ? `${meters} m` : `${km.toFixed(1)} km`;
}

/** Seconds per km, as seconds per the runner's unit: what a pace is shown as. */
export function paceInUnits(secondsPerKm: number, units: Units): number {
  return secondsPerKm * unitKm(units);
}

/** The other way: a pace typed per the runner's unit, as the seconds per km the Planner keeps. */
export function secondsPerKmFromPace(secondsPerUnit: number, units: Units): number {
  return secondsPerUnit / unitKm(units);
}

export interface AxisMark {
  /** Where the mark goes: km from the start, like everything else that is placed on the strip. */
  km: number;
  /** What it says, in the shown unit: "5", "10". */
  label: string;
}

/** A labelled mark every five of the runner's units along a course of this length. */
export function axisMarks(lengthKm: number, units: Units, every = 5): AxisMark[] {
  const step = unitKm(units) * every;
  const marks: AxisMark[] = [];
  // Counted (0, 1, 2 steps), not added up, so the marks never drift off the round numbers.
  for (let count = 0; count * step <= lengthKm; count += 1) marks.push({ km: count * step, label: String(count * every) });
  return marks;
}
