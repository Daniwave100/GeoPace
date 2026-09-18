// Seam: a grid of heights -> the contour lines at one height.
// The roadbook direction prints contour lines the way a survey map does. They are texture, but
// they are still drawn honestly: a contour at 50 must pass exactly between a 40 and a 60.
import { describe, expect, it } from "vitest";
import { contourSegments } from "../src/mockups/contours";

describe("contour tracing", () => {
  it("draws nothing across ground that never reaches the level", () => {
    const flat = [
      [10, 10, 10],
      [10, 10, 10],
    ];

    expect(contourSegments(flat, 50)).toEqual([]);
  });

  it("crosses each cell edge at the interpolated height", () => {
    // Heights rise left to right: 40 | 60, so the 50 contour runs straight down the middle.
    const ramp = [
      [40, 60],
      [40, 60],
    ];
    const segments = contourSegments(ramp, 50);

    expect(segments).toHaveLength(1);
    const [segment] = segments;
    expect(segment.from.x).toBeCloseTo(0.5, 9);
    expect(segment.to.x).toBeCloseTo(0.5, 9);
    expect(new Set([segment.from.y, segment.to.y])).toEqual(new Set([0, 1]));
  });

  it("sits nearer the corner that is closer to the level", () => {
    // 45 -> 65: the 50 level is a quarter of the way across.
    const ramp = [
      [45, 65],
      [45, 65],
    ];
    const [segment] = contourSegments(ramp, 50);

    expect(segment.from.x).toBeCloseTo(0.25, 9);
  });

  it("closes a ring around a single summit", () => {
    const summit = [
      [0, 0, 0],
      [0, 100, 0],
      [0, 0, 0],
    ];
    const segments = contourSegments(summit, 50);

    // One segment per surrounding cell, and every endpoint is shared by exactly two segments.
    expect(segments).toHaveLength(4);
    const counts = new Map<string, number>();
    for (const { from, to } of segments) {
      for (const p of [from, to]) {
        const key = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });
});
