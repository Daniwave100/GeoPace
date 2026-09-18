// Seam: a runner's heading + a compass direction -> what they actually feel.
//
// Two conventions meet here and they point opposite ways, which is exactly why this seam is
// tested (CLAUDE.md, "traps that must have tests"):
//   • wind direction is meteorological — the degrees the wind blows *from*
//   • a sun azimuth is the direction the sun *is in*
// So "wind 0°" and "sun 0°" both say north, but one is in your face and the other is behind you.
import { describe, expect, it } from "vitest";
import { localVector, relativeBearing, sunOnRunner, windOnRunner } from "../src/core/bearing";

const NORTH = 0;
const EAST = 90;
const SOUTH = 180;
const WEST = 270;

describe("relative bearing", () => {
  it("measures the turn from your heading to a compass direction, the short way round", () => {
    expect(relativeBearing(NORTH, EAST)).toBe(90); // east is a quarter turn to your right
    expect(relativeBearing(NORTH, WEST)).toBe(-90); // west is a quarter turn to your left
    expect(relativeBearing(350, 10)).toBe(20); // across north, not 340° the long way
    expect(relativeBearing(10, 350)).toBe(-20);
  });
});

describe("the runner's own frame", () => {
  it("turns a compass direction into right-and-ahead, whichever way the runner faces", () => {
    // Heading north: east is one metre to the right, north is one metre ahead.
    expect(round(localVector(NORTH, EAST))).toEqual({ right: 1, ahead: 0 });
    expect(round(localVector(NORTH, NORTH))).toEqual({ right: 0, ahead: 1 });

    // Turn the runner east and the same north is now on their left.
    expect(round(localVector(EAST, NORTH))).toEqual({ right: -1, ahead: 0 });
    expect(round(localVector(EAST, SOUTH))).toEqual({ right: 1, ahead: 0 });
    expect(round(localVector(EAST, WEST))).toEqual({ right: 0, ahead: -1 });
  });
});

function round({ right, ahead }: { right: number; ahead: number }): { right: number; ahead: number } {
  return { right: Math.round(right * 1e6) / 1e6 + 0, ahead: Math.round(ahead * 1e6) / 1e6 + 0 };
}

describe("wind on a runner", () => {
  it("calls a wind blowing from straight ahead a headwind, not a tailwind", () => {
    // Heading north into a wind *from* the north. This is the inversion that would silently turn
    // every headwind in the app into free speed.
    const inYourFace = windOnRunner(NORTH, NORTH);
    expect(inYourFace.description).toBe("headwind");
    expect(inYourFace.headwindFraction).toBeCloseTo(1, 6);

    // Same heading, wind from the south: it is pushing you along.
    const atYourBack = windOnRunner(NORTH, SOUTH);
    expect(atYourBack.description).toBe("tailwind");
    expect(atYourBack.headwindFraction).toBeCloseTo(-1, 6);
  });

  it("puts a crosswind on the side it comes from", () => {
    const fromTheEast = windOnRunner(NORTH, EAST);
    expect(fromTheEast.description).toBe("crosswind");
    expect(fromTheEast.side).toBe("right");
    expect(fromTheEast.headwindFraction).toBeCloseTo(0, 6);

    expect(windOnRunner(NORTH, WEST).side).toBe("left");
    // Berlin's westerlies, met on the long eastward leg out of the city centre.
    expect(windOnRunner(EAST, WEST).description).toBe("tailwind");
  });
});

describe("sun on a runner", () => {
  it("puts the morning sun on the shoulder it is actually over", () => {
    // Sun in the east; a runner heading north has it over their right shoulder.
    expect(sunOnRunner(NORTH, EAST).side).toBe("right");
    // Turn around and run south and the same sun is on the left.
    expect(sunOnRunner(SOUTH, EAST).side).toBe("left");
    // Run into it, or away from it.
    expect(sunOnRunner(EAST, EAST).side).toBe("ahead");
    expect(sunOnRunner(WEST, EAST).side).toBe("behind");
  });
});
