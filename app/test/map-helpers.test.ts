// Seams: labels on the map -> which of them stay; the blocks over the map -> where the camera sits.
import { describe, expect, it } from "vitest";
import { keepLabels } from "../src/core/declutter";
import { nearEndBelowCentreRad, rangeToFitM, sidewaysShiftM } from "../src/core/framing";
import { isOverTheHorizon } from "../src/core/horizon";

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
  const view = { rangeM: 50_000, fovRad: Math.PI / 3, viewWidthPx: 1600, viewHeightPx: 600 };

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

describe("standing far enough back to see the whole course", () => {
  const square = { radiusM: 12_000, tiltRad: Math.PI / 2, fovRad: Math.PI / 2, viewWidthPx: 1000, viewHeightPx: 1000, coveredLeftPx: 0 };

  it("fits the course's radius into half the view, with a little air", () => {
    // Looking straight down with a 90° view: half the view is as wide as the camera is far.
    expect(rangeToFitM(square)).toBeCloseTo(12_000 * 1.15, 6);
  });

  it("stands further back when the map is a letterbox, because the course has to fit its height too", () => {
    expect(rangeToFitM({ ...square, viewHeightPx: 250 })).toBeCloseTo(4 * 12_000 * 1.15, 6);
  });

  it("stands further back when a block covers part of the map", () => {
    expect(rangeToFitM({ ...square, coveredLeftPx: 500 })).toBeCloseTo(2 * 12_000 * 1.15, 6);
  });

  it("puts the near end of the course exactly on the bottom edge of a tilted view, before the margin of air", () => {
    // A camera tilted 60° stands to the south, so the southern end is nearest and lands lowest.
    const letterbox = { ...square, viewHeightPx: 250, tiltRad: Math.PI / 3 };
    const range = rangeToFitM(letterbox) / 1.15;
    const halfHeightRad = Math.atan(Math.tan(Math.PI / 4) * (250 / 1000));

    expect(nearEndBelowCentreRad(range, 12_000, Math.PI / 3)).toBeCloseTo(halfHeightRad, 6);
    // Any closer and the start of the course would be off the bottom of the map.
    expect(nearEndBelowCentreRad(range * 0.9, 12_000, Math.PI / 3)).toBeGreaterThan(halfHeightRad);
  });
});

describe("a place that has gone over the horizon", () => {
  const R = 6_371_000;
  const sphere = { x: R, y: R, z: R };
  const onTheGround = (lonDeg: number) => ({ x: R * Math.cos((lonDeg * Math.PI) / 180), y: R * Math.sin((lonDeg * Math.PI) / 180), z: 0 });
  const above = (lonDeg: number, heightM: number) => {
    const ground = onTheGround(lonDeg);
    return { x: ground.x * (1 + heightM / R), y: ground.y * (1 + heightM / R), z: 0 };
  };

  it("is still in view straight below the camera, and across a city", () => {
    expect(isOverTheHorizon(above(0, 20_000), onTheGround(0), sphere)).toBe(false);
    expect(isOverTheHorizon(above(0, 20_000), onTheGround(0.3), sphere)).toBe(false); // ~33 km away
  });

  it("is hidden once it is round the back of the globe", () => {
    expect(isOverTheHorizon(above(0, 20_000), onTheGround(180), sphere)).toBe(true);
    // From 20 km up the horizon is about 500 km away: 10 degrees of longitude is over it.
    expect(isOverTheHorizon(above(0, 20_000), onTheGround(10), sphere)).toBe(true);
    // From far out in space, half the globe is in view.
    expect(isOverTheHorizon(above(0, 30_000_000), onTheGround(60), sphere)).toBe(false);
    expect(isOverTheHorizon(above(0, 30_000_000), onTheGround(120), sphere)).toBe(true);
  });
});
