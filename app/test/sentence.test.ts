// Seam: where the sun is + which way the runner is heading -> the words the runner reads.
import { describe, expect, it } from "vitest";
import { sunClause } from "../src/plan/sentence";

describe("the sentence's sun clause", () => {
  it("says how high the sun is, where in the sky, and where that is from the runner", () => {
    // Heading north (0°) with the sun in the east-south-east (110°): off to the right.
    expect(sunClause({ altitudeDeg: 25.4, azimuthDeg: 110 }, 0)).toBe("Sun 25° up in the ESE, over your right shoulder.");
    expect(sunClause({ altitudeDeg: 31, azimuthDeg: 180 }, 180)).toBe("Sun 31° up in the S, in your eyes.");
    expect(sunClause({ altitudeDeg: 12, azimuthDeg: 250 }, 70)).toBe("Sun 12° up in the WSW, behind you.");
    expect(sunClause({ altitudeDeg: 40, azimuthDeg: 90 }, 180)).toBe("Sun 40° up in the E, over your left shoulder.");
  });

  it("says so when the sun is down, instead of giving a direction nobody can see", () => {
    expect(sunClause({ altitudeDeg: -3, azimuthDeg: 260 }, 0)).toBe("The sun is below the horizon.");
    expect(sunClause({ altitudeDeg: 0, azimuthDeg: 260 }, 0)).toBe("The sun is below the horizon.");
  });
});
