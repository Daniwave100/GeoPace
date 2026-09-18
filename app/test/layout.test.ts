// Seam: positions along the course -> positions on a page.
// The designs draw differently, but they all have to put a kilometre at the right pixel and keep
// labels that sit close together on the course from printing on top of each other.
import { describe, expect, it } from "vitest";
import { assignLanes, effortReach, heightDomain, linearScale, measuredRuns, spreadLabels } from "../src/core/layout";

describe("linear scale", () => {
  it("maps a domain onto a range", () => {
    const x = linearScale([0, 42], [100, 940]);

    expect(x(0)).toBeCloseTo(100, 9);
    expect(x(42)).toBeCloseTo(940, 9);
    expect(x(21)).toBeCloseTo(520, 9);
  });

  it("handles a range that runs backwards, as a chart's vertical axis does", () => {
    const y = linearScale([0, 50], [200, 0]);

    expect(y(0)).toBeCloseTo(200, 9);
    expect(y(50)).toBeCloseTo(0, 9);
    expect(y(25)).toBeCloseTo(100, 9);
  });

  it("does not divide by zero on a flat domain", () => {
    expect(linearScale([7, 7], [0, 100])(7)).toBe(0);
  });
});

describe("label spreading", () => {
  const bounds = { min: 0, max: 600 };

  it("leaves labels alone when they already have room", () => {
    const placed = spreadLabels(
      [
        { at: 100, size: 20 },
        { at: 300, size: 20 },
      ],
      bounds,
      4,
    );

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
    const placed = spreadLabels(
      [
        { at: 300, size: 20 },
        { at: 100, size: 20 },
      ],
      bounds,
      4,
    );

    expect(placed).toEqual([300, 100]);
  });
});

describe("label lanes", () => {
  it("keeps labels on one line while they don't touch", () => {
    expect(
      assignLanes(
        [
          { start: 0, end: 40 },
          { start: 50, end: 90 },
        ],
        4,
      ),
    ).toEqual([0, 0]);
  });

  it("drops a label to the next lane when it would run into the one before", () => {
    // Three names starting close together, as at the end of the NYC course.
    const lanes = assignLanes(
      [
        { start: 0, end: 80 },
        { start: 20, end: 100 },
        { start: 40, end: 120 },
        { start: 90, end: 150 },
      ],
      4,
      6,
    );

    expect(lanes).toEqual([0, 1, 2, 0]);
  });

  it("reuses the emptiest lane rather than failing when it runs out", () => {
    const lanes = assignLanes(
      [
        { start: 0, end: 100 },
        { start: 10, end: 60 },
        { start: 20, end: 120 },
      ],
      2,
    );

    // Both lanes are busy at 20; the second one frees up first.
    expect(lanes).toEqual([0, 1, 1]);
  });
});

describe("label lanes, out of order", () => {
  it("still avoids a label placed earlier that reaches back over it", () => {
    // Near the finish a name is set to the left of its tick, so its box starts before the
    // previous label's does.
    const lanes = assignLanes(
      [
        { start: 100, end: 180 },
        { start: 60, end: 140 },
      ],
      3,
      4,
    );

    expect(lanes[0]).not.toBe(lanes[1]);
  });

  it("lets a label share a lane with a later one it doesn't reach", () => {
    expect(
      assignLanes(
        [
          { start: 100, end: 180 },
          { start: 0, end: 40 },
        ],
        3,
        4,
      ),
    ).toEqual([0, 0]);
  });
});

describe("height domain", () => {
  it("starts just under the course's low point so a flat course still has a shape", () => {
    const [low, high] = heightDomain({ elevation: { minM: 30, maxM: 53 } });

    expect(high).toBe(53);
    expect(low).toBeLessThan(30);
    expect(low).toBeGreaterThan(25);
  });
});

describe("measured runs", () => {
  const bins = [true, true, false, false, true].map((elevationMeasured, index) => ({ elevationMeasured, index }));

  it("splits a profile into stretches that are measured and stretches that are not", () => {
    const runs = measuredRuns(bins);

    expect(runs.map((run) => [run.measured, run.bins.map((bin) => bin.index)])).toEqual([
      [true, [0, 1]],
      [false, [2, 3]],
      [true, [4]],
    ]);
  });

  it("can reach one bin into its neighbours so a dashed line meets the solid one either side", () => {
    const runs = measuredRuns(bins, { bridgeGaps: true });
    const gap = runs.find((run) => !run.measured);

    expect(gap?.bins.map((bin) => bin.index)).toEqual([1, 2, 3, 4]);
    // The measured stretches are untouched: nothing measured is ever drawn as a guess.
    expect(runs.filter((run) => run.measured).map((run) => run.bins.map((bin) => bin.index))).toEqual([[0, 1], [4]]);
  });
});

describe("effort reach", () => {
  it("is the biggest departure from flat-ground effort, ignoring stretches outside the model", () => {
    expect(effortReach([{ difficulty: 1.1 }, { difficulty: 0.8 }, { difficulty: null }])).toBeCloseTo(0.2, 9);
  });

  it("never collapses to zero on a dead-flat course", () => {
    expect(effortReach([{ difficulty: 1 }, { difficulty: 1 }])).toBeGreaterThan(0);
  });
});
