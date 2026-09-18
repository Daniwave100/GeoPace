// Seam: a strip row's bins -> the shapes that draw it. What must hold: measured is a solid line
// with a fill, filled-in height is a dashed line with none, and nothing is drawn through a hole.
import { describe, expect, it } from "vitest";
import type { RowBin } from "../src/core/layers";
import { linearScale } from "../src/core/layout";
import { tracePaths } from "../src/core/trace";

const bins = (values: (number | null)[], notMeasured: number[] = []): RowBin[] =>
  values.map((value, i) => ({ startKm: i, midKm: i + 0.5, endKm: i + 1, value, measured: !notMeasured.includes(i) }));
const box = { x: linearScale([0, 10], [100, 1100]), top: 20, height: 60 };
const smooth = { domain: [0, 10] as [number, number], baseline: "bottom" as const, stepped: false };

describe("a strip row's trace", () => {
  it("is one solid line through the middle of each bin, with a fill down to the bottom of the row", () => {
    const paths = tracePaths(smooth, bins([0, 5, 10]), box);

    expect(paths.measured).toHaveLength(1);
    expect(paths.measured[0].line).toBe("M150.0 77.0L250.0 50.0L350.0 23.0");
    expect(paths.measured[0].area).toBe("M150.0 77.0L250.0 50.0L350.0 23.0L350.0 80.0L150.0 80.0Z");
    expect(paths.notMeasured).toEqual([]);
  });

  it("draws filled-in height as its own dashed piece, joined to the solid line either side, with no fill", () => {
    const paths = tracePaths(smooth, bins([1, 2, 3, 4, 5, 6], [2, 3]), box);

    expect(paths.measured.map((piece) => piece.line)).toEqual(["M150.0 71.6L250.0 66.2", "M550.0 50.0L650.0 44.6"]);
    // From the last measured bin before the gap to the first one after it: no hole in the line.
    expect(paths.notMeasured).toEqual(["M250.0 66.2L350.0 60.8L450.0 55.4L550.0 50.0"]);
  });

  it("never draws through a stretch with no value: the line stops, and a block marks the hole", () => {
    const paths = tracePaths(smooth, bins([1, 2, null, 4, 5]), box);

    expect(paths.measured.map((piece) => piece.line)).toEqual(["M150.0 71.6L250.0 66.2", "M450.0 55.4L550.0 50.0"]);
    expect(paths.noValue).toEqual([{ x: 300, width: 100 }]);
  });

  it("hangs the fill from a value when the row has one: flat ground for grade, not the bottom of the row", () => {
    const grade = { domain: [-4, 4] as [number, number], baseline: 0, stepped: false };
    const paths = tracePaths(grade, bins([2, -2]), box);

    expect(paths.baselineY).toBe(50);
    expect(paths.measured[0].area).toBe("M150.0 36.5L250.0 63.5L250.0 50.0L150.0 50.0Z");
  });

  it("holds each bin's value flat when the row is stepped", () => {
    const effort = { domain: [0, 10] as [number, number], baseline: 5, stepped: true };
    const paths = tracePaths(effort, bins([0, 10]), box);

    expect(paths.measured[0].line).toBe("M100.0 77.0L200.0 77.0L200.0 23.0L300.0 23.0");
  });

  it("marks how much, bin by bin, from the baseline to the value, and only where the value is measured", () => {
    const grade = { domain: [-4, 4] as [number, number], baseline: 0, stepped: false };
    const paths = tracePaths(grade, bins([2, -2, 4, 1], [2]), box, [1, 2, 3, 0]);

    expect(paths.levelBlocks).toEqual([
      { x: 100, width: 100, y: 36.5, height: 13.5, level: 1 }, // above the flat line: a climb
      { x: 200, width: 100, y: 50, height: 13.5, level: 2 }, // below it: a descent
      // bin 2 is steep but not measured: no block; bin 3 is level 0: no block
    ]);
    expect(tracePaths(grade, bins([2, -2]), box).levelBlocks).toEqual([]);
  });
});
