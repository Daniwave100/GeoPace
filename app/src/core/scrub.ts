// Scrubbing: moving the runner along the course by hand. The arithmetic of it, with no DOM and
// no 3D in sight: what a key press or a pointer position means in km, and where on the road a km
// is. The strip and the scene both use these, which is part of what keeps them in step.
import type { CourseLine } from "../bundle/types";
import { clamp } from "./series";

/** One press of an arrow key: a tenth of the runner's unit (100 m, or 161 m), fine enough to find the top of a bridge. */
const STEP = 0.1;
/** Shift + arrow, or Page Up/Down: one kilometre or one mile, the unit the runner thinks in. */
const BIG_STEP = 1;

/** About a millimetre: what floating point may have left a position short of, or past, a mark. */
const ON_THE_MARK = 1e-6;

/** The part of a KeyboardEvent this needs. */
export interface ScrubKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Where a key press moves the runner, or null if the press isn't for the strip. Steps land on
 * round numbers (the next tenth, the next whole km) rather than adding to wherever a click left
 * the runner, so "km 30" can always be reached. `unitKm` is the length in km of the unit the
 * runner is shown (1, or 1.609344 for miles): the round numbers are counted in that unit, so with
 * miles shown the steps land on whole miles and tenths of a mile. Presses with Alt, Ctrl or Cmd
 * belong to the browser: Alt+Left and Cmd+Left are Back.
 */
export function kmAfterKey(pressed: ScrubKey, km: number, lengthKm: number, unitKm = 1): number | null {
  if (pressed.altKey || pressed.ctrlKey || pressed.metaKey) return null;
  const step = pressed.shiftKey ? BIG_STEP : STEP;
  const shown = km / unitKm;
  const land = (mark: number) => clamp(mark * unitKm, 0, lengthKm);
  switch (pressed.key) {
    case "ArrowRight":
    case "ArrowUp":
      return land(nextMark(shown, step));
    case "ArrowLeft":
    case "ArrowDown":
      return land(previousMark(shown, step));
    case "PageUp":
      return land(nextMark(shown, BIG_STEP));
    case "PageDown":
      return land(previousMark(shown, BIG_STEP));
    case "Home":
      return 0;
    case "End":
      return lengthKm;
    default:
      return null;
  }
}

/** The first multiple of `step` beyond `position`. Counted in whole steps, so 0.1 steps never drift. */
function nextMark(position: number, step: number): number {
  const stepsPerUnit = Math.round(1 / step);
  return (Math.floor((position + ON_THE_MARK) * stepsPerUnit) + 1) / stepsPerUnit;
}

function previousMark(position: number, step: number): number {
  const stepsPerUnit = Math.round(1 / step);
  return (Math.ceil((position - ON_THE_MARK) * stepsPerUnit) - 1) / stepsPerUnit;
}

/** The km under the pointer, given how far along the strip it is (0 = left end, 1 = right end). */
export function kmAtFraction(fraction: number, lengthKm: number): number {
  return clamp(fraction, 0, 1) * lengthKm;
}

export interface RoadPosition {
  lat: number;
  lon: number;
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
    // The heading of the stretch being run. Blending headings would cut every corner.
    bearingDeg: line.bearing_deg[low],
  };
}
