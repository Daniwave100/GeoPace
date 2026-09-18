// Seam: positions along the course -> positions on a page.
// The designs draw differently, but they all have to put a kilometre at the right pixel and keep
// labels that sit close together on the course from printing on top of each other.
import { describe, expect, it } from "vitest";
import { linearScale, spreadLabels } from "../src/mockups/layout";

describe("linear scale", () => {
  it("maps a domain onto a range and back again", () => {
    const x = linearScale([0, 42], [100, 940]);

    expect(x(0)).toBeCloseTo(100, 9);
    expect(x(42)).toBeCloseTo(940, 9);
    expect(x(21)).toBeCloseTo(520, 9);
    expect(x.invert(520)).toBeCloseTo(21, 9);
  });

  it("handles a range that runs backwards, as a chart's vertical axis does", () => {
    const y = linearScale([0, 50], [200, 0]);

    expect(y(0)).toBeCloseTo(200, 9);
    expect(y(50)).toBeCloseTo(0, 9);
    expect(y.invert(100)).toBeCloseTo(25, 9);
  });

  it("does not divide by zero on a flat domain", () => {
    expect(linearScale([7, 7], [0, 100])(7)).toBe(0);
  });
});

describe("label spreading", () => {
  const bounds = { min: 0, max: 600 };

  it("leaves labels alone when they already have room", () => {
    const placed = spreadLabels([{ at: 100, size: 20 }, { at: 300, size: 20 }], bounds, 4);

    expect(placed).toEqual([100, 300]);
  });

  it("pushes crowded labels apart until none overlap, without reordering them", () => {
    const labels = [
      { at: 200, size: 30 },
      { at: 205, size: 30 },
      { at: 210, size: 30 },
      { at: 400, size: 30 },
    ];
    const placed = spreadLabels(labels, bounds, 4);

    for (let i = 1; i < placed.length; i += 1) {
      const clearance = placed[i] - labels[i].size / 2 - (placed[i - 1] + labels[i - 1].size / 2);
      expect(clearance).toBeGreaterThanOrEqual(4 - 1e-9);
    }
    // The one that had room stays exactly where its kilometre is.
    expect(placed[3]).toBe(400);
    // The crowd stays centred on where it wanted to be, rather than all sliding one way.
    expect((placed[0] + placed[2]) / 2).toBeCloseTo(205, 6);
  });

  it("keeps labels on the page when the crowd is at the very end of the course", () => {
    const labels = [
      { at: 590, size: 24 },
      { at: 596, size: 24 },
      { at: 600, size: 24 },
    ];
    const placed = spreadLabels(labels, bounds, 2);

    expect(placed[2] + 12).toBeLessThanOrEqual(600 + 1e-9);
    expect(placed[0] - 12).toBeGreaterThanOrEqual(0);
    expect(placed[1] - placed[0]).toBeGreaterThanOrEqual(26 - 1e-9);
    expect(placed[2] - placed[1]).toBeGreaterThanOrEqual(26 - 1e-9);
  });

  it("returns positions in the order the labels were given, even if given out of order", () => {
    const placed = spreadLabels([{ at: 300, size: 20 }, { at: 100, size: 20 }], bounds, 4);

    expect(placed).toEqual([300, 100]);
  });
});
