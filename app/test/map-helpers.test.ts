// Seams: labels on the map -> which of them stay; the blocks over the map -> where the camera sits.
import { describe, expect, it } from "vitest";
import { keepLabels } from "../src/core/declutter";
import { sidewaysShiftM } from "../src/core/framing";

describe("labels that would overprint each other", () => {
  const box = (left: number, priority: number) => ({ left, top: 0, width: 100, height: 20, priority });

  it("all stay when there is room", () => {
    expect(keepLabels([box(0, 1), box(200, 2)])).toEqual([true, true]);
  });

  it("give way to the more important one", () => {
    expect(keepLabels([box(0, 1), box(50, 9)])).toEqual([false, true]);
  });

  it("come back as soon as the label that beat them is itself beaten out of the way", () => {
    // A beats B, and with B gone C fits again: the biggest hill, then whatever still has room.
    expect(keepLabels([box(0, 10), box(90, 5), box(180, 1)])).toEqual([true, false, true]);
    // Too close to A itself: still no room.
    expect(keepLabels([box(0, 10), box(90, 5), box(100, 1)])).toEqual([true, false, false]);
  });
});

describe("framing the course beside the readout block", () => {
  const view = { rangeM: 50_000, fovRad: Math.PI / 3, viewWidthPx: 1600 };

  it("doesn't move the camera when nothing covers the map", () => {
    expect(sidewaysShiftM({ ...view, coveredLeftPx: 0 })).toBe(0);
  });

  it("slides it by half of what is covered, in meters at the course's distance", () => {
    const visibleWidthM = 2 * 50_000 * Math.tan(Math.PI / 6);
    expect(sidewaysShiftM({ ...view, coveredLeftPx: 400 })).toBeCloseTo(visibleWidthM / 8, 6);
  });

  it("copes with a view that has no width yet", () => {
    expect(sidewaysShiftM({ ...view, viewWidthPx: 0, coveredLeftPx: 300 })).toBe(0);
  });
});
