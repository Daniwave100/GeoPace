// Scrubbing: moving the runner along the course by hand. The arithmetic of it, with no DOM and
// no 3D in sight: what a key press or a pointer position means in km, and where on the road a km
// is. The strip and the scene both use these, which is part of what keeps them in step.
import type { CourseLine } from "../bundle/types";
import { clamp } from "./series";

/** One press of an arrow key: 100 m, fine enough to find the top of a bridge. */
const STEP_KM = 0.1;
/** Shift + arrow, or Page Up/Down: one kilometre, the unit runners think in. */
const BIG_STEP_KM = 1;

/** The part of a KeyboardEvent this needs. */
export interface ScrubKey {
  key: string;
  shiftKey: boolean;
}

/** Where a key press moves the runner, or null if the key isn't a scrubbing key. */
export function kmAfterKey(pressed: ScrubKey, km: number, lengthKm: number): number | null {
  const step = pressed.shiftKey ? BIG_STEP_KM : STEP_KM;
  switch (pressed.key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(km + step, 0, lengthKm);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(km - step, 0, lengthKm);
    case "PageUp":
      return clamp(km + BIG_STEP_KM, 0, lengthKm);
    case "PageDown":
      return clamp(km - BIG_STEP_KM, 0, lengthKm);
    case "Home":
      return 0;
    case "End":
      return lengthKm;
    default:
      return null;
  }
}

/** The km under the pointer, given how far along the strip it is (0 = left end, 1 = right end). */
export function kmAtFraction(fraction: number, lengthKm: number): number {
  return clamp(fraction, 0, 1) * lengthKm;
}

export interface RoadPosition {
  lat: number;
  lon: number;
  elevationM: number;
  /** Direction of travel, degrees clockwise from true north. */
  bearingDeg: number;
}

/**
 * The place on the course line at `km`: on the straight line between the two samples around it.
 * Samples are ~10 m apart, so a straight line between them never leaves the road.
 */
export function positionAtKm(line: CourseLine, km: number): RoadPosition {
  const last = line.km.length - 1;
  const position = clamp(km, line.km[0], line.km[last]);
  // The sample at or before `position`. Binary search: this runs on every pointer move.
  let low = 0;
  let high = last;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (line.km[mid] <= position) low = mid;
    else high = mid - 1;
  }
  const next = Math.min(low + 1, last);
  const span = line.km[next] - line.km[low];
  const t = span > 0 ? (position - line.km[low]) / span : 0;
  const between = (column: number[]) => column[low] + (column[next] - column[low]) * t;
  return {
    lat: between(line.lat),
    lon: between(line.lon),
    elevationM: between(line.elevation_m),
    // The heading of the stretch being run. Blending headings would cut every corner.
    bearingDeg: line.bearing_deg[low],
  };
}
