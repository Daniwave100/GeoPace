// Seam: how the wind meets the runner -> which way its arrow points on the page.
// CLAUDE.md names this trap: a headwind must never come out as a tailwind. `bearing.ts` pins the
// convention for the numbers; this pins it for the drawing, where it is just as easy to flip.
import { describe, expect, it } from "vitest";
import { windOnRunner } from "../src/core/bearing";
import { windArrowOnPage } from "../src/core/layout";

describe("wind arrow on the page", () => {
  it("points back at the runner for a headwind, whichever way the strip runs", () => {
    // Runner heading north, wind FROM the north: dead ahead.
    const headwind = windOnRunner(0, 0).angleDeg;

    // On a strip read left to right, the runner moves right, so the arrow points left.
    const across = windArrowOnPage(headwind, "right");
    expect(across.dx).toBeCloseTo(-1, 9);
    expect(across.dy).toBeCloseTo(0, 9);

    // On a card read top to bottom, the runner moves down, so the arrow points up.
    const down = windArrowOnPage(headwind, "down");
    expect(down.dx).toBeCloseTo(0, 9);
    expect(down.dy).toBeCloseTo(-1, 9);
  });

  it("points the way the runner is going for a tailwind", () => {
    // Runner heading north, wind FROM the south.
    const tailwind = windOnRunner(0, 180).angleDeg;

    expect(windArrowOnPage(tailwind, "right").dx).toBeCloseTo(1, 9);
    expect(windArrowOnPage(tailwind, "down").dy).toBeCloseTo(1, 9);
  });

  it("crosses the page from the side the wind comes from", () => {
    // Runner heading north, wind FROM the east: it arrives on the runner's right and blows left.
    const fromRight = windOnRunner(0, 90).angleDeg;

    // Moving right across the page, the runner's right hand is towards the bottom (+y), so the
    // wind travels up the page.
    expect(windArrowOnPage(fromRight, "right").dy).toBeCloseTo(-1, 9);
    // Moving down the page, the runner's right hand is towards the page's left (-x), so the wind
    // travels to the page's right.
    expect(windArrowOnPage(fromRight, "down").dx).toBeCloseTo(1, 9);
  });
});
