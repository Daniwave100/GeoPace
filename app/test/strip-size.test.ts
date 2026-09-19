// Seam: how tall the runner has made the strip -> the size it is drawn at, remembered.
import { describe, expect, it } from "vitest";
import { loadStripSize, saveStripSize, sizeAfterDrag, sizeAfterKey, STRIP_SIZE, type StripSizeStorage } from "../src/core/strip-size";

function fakeStorage(initial: Record<string, string> = {}): StripSizeStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value) };
}

describe("the strip's size", () => {
  it("is the designed size until the runner changes it", () => {
    expect(loadStripSize(fakeStorage())).toBe(1);
  });

  it("is remembered across a reload", () => {
    const storage = fakeStorage();
    saveStripSize(storage, 1.6);
    expect(loadStripSize(storage)).toBe(1.6);
  });

  it("stays within what is readable and what leaves room for the map, whatever storage says", () => {
    expect(loadStripSize(fakeStorage({ "geopace.strip-size": "99" }))).toBe(STRIP_SIZE.max);
    expect(loadStripSize(fakeStorage({ "geopace.strip-size": "0.01" }))).toBe(STRIP_SIZE.min);
    expect(loadStripSize(fakeStorage({ "geopace.strip-size": '"tall"' }))).toBe(1);
    expect(loadStripSize(fakeStorage({ "geopace.strip-size": "not json" }))).toBe(1);
  });

  it("grows when its top edge is dragged up and shrinks when it is dragged down", () => {
    // The rows are 110 px tall at size 1. Dragging the edge up 55 px makes them half as tall again.
    expect(sizeAfterDrag({ sizeAtStart: 1, rowsHeightAtSizeOne: 110, draggedUpPx: 55 })).toBeCloseTo(1.5, 9);
    expect(sizeAfterDrag({ sizeAtStart: 1, rowsHeightAtSizeOne: 110, draggedUpPx: -33 })).toBeCloseTo(0.7, 9);
    expect(sizeAfterDrag({ sizeAtStart: 1, rowsHeightAtSizeOne: 110, draggedUpPx: -500 })).toBe(STRIP_SIZE.min);
    expect(sizeAfterDrag({ sizeAtStart: 2, rowsHeightAtSizeOne: 110, draggedUpPx: 500 })).toBe(STRIP_SIZE.max);
  });

  it("answers to the keyboard: up and down a step, Home and End to the ends, Enter back to the designed size", () => {
    expect(sizeAfterKey("ArrowUp", 1)).toBeCloseTo(1.1, 9);
    expect(sizeAfterKey("ArrowDown", 1)).toBeCloseTo(0.9, 9);
    expect(sizeAfterKey("Home", 1.3)).toBe(STRIP_SIZE.min);
    expect(sizeAfterKey("End", 1.3)).toBe(STRIP_SIZE.max);
    expect(sizeAfterKey("Enter", 1.7)).toBe(1);
    expect(sizeAfterKey("ArrowUp", STRIP_SIZE.max)).toBe(STRIP_SIZE.max);
    expect(sizeAfterKey("a", 1.3)).toBeNull();
  });
});
