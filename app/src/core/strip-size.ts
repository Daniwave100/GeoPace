// How tall the runner has made the strip. Its top edge drags up and down (and answers to the
// arrow keys), so the rows can be read large or squeezed down to give the map the room. The size
// is a multiple of the designed row heights, remembered in the browser.
import { type BrowserStorage, readStored, writeStored } from "../browser-storage";

export type StripSizeStorage = Pick<BrowserStorage, "getItem" | "setItem">;

/** Below the smallest a trace can't be read; above the largest there is no map left on a laptop. */
export const STRIP_SIZE = { min: 0.4, max: 2.5, designed: 1, step: 0.1 };

const KEY = "geopace.strip-size";

function within(size: number): number {
  return Math.min(Math.max(size, STRIP_SIZE.min), STRIP_SIZE.max);
}

export function loadStripSize(storage: StripSizeStorage): number {
  const stored = readStored(storage, KEY);
  return typeof stored === "number" && Number.isFinite(stored) ? within(stored) : STRIP_SIZE.designed;
}

export function saveStripSize(storage: StripSizeStorage, size: number): void {
  writeStored(storage, KEY, within(size)); // if the browser won't keep it, it lasts for this visit
}

export interface StripDrag {
  sizeAtStart: number;
  /** How tall the rows are at the designed size, in pixels: what a size of 1 means on screen. */
  rowsHeightAtSizeOne: number;
  /** How far the strip's top edge has been dragged up since the drag began; negative is down. */
  draggedUpPx: number;
}

/** Dragging the top edge up by as much as the rows are tall makes them twice as tall. */
export function sizeAfterDrag({ sizeAtStart, rowsHeightAtSizeOne, draggedUpPx }: StripDrag): number {
  if (rowsHeightAtSizeOne <= 0) return sizeAtStart;
  return within(sizeAtStart + draggedUpPx / rowsHeightAtSizeOne);
}

/** The size after a key press on the strip's top edge, or null if the key isn't for it. */
export function sizeAfterKey(key: string, size: number): number | null {
  switch (key) {
    case "ArrowUp":
      return within(size + STRIP_SIZE.step);
    case "ArrowDown":
      return within(size - STRIP_SIZE.step);
    case "Home":
      return STRIP_SIZE.min;
    case "End":
      return STRIP_SIZE.max;
    case "Enter":
      return STRIP_SIZE.designed;
    default:
      return null;
  }
}
