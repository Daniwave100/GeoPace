// Seam: where the sun is -> the shadow it throws on flat ground.
// Schoolroom geometry: a shadow is the object's height divided by the tangent of the sun's
// altitude, and it points straight away from the sun.
import { describe, expect, it } from "vitest";
import { shadowCast } from "../src/core/shadow";

describe("shadow cast", () => {
  it("makes a shadow as long as the object is tall when the sun is halfway up the sky", () => {
    const noon = shadowCast({ altitudeDeg: 45, azimuthDeg: 180 });

    expect(noon.isLit).toBe(true);
    expect(noon.lengthPerMeter).toBeCloseTo(1, 6);
    // A shadow falls away from the sun: sun in the south, shadow to the north.
    expect(noon.bearingDeg).toBeCloseTo(0, 6);
  });

  it("stretches shadows as the sun drops, and throws them opposite the sun", () => {
    // tan(30°) = 0.577, so a 1 m post throws 1.73 m.
    expect(shadowCast({ altitudeDeg: 30, azimuthDeg: 90 }).lengthPerMeter).toBeCloseTo(Math.sqrt(3), 6);
    // Sun in the east, shadow to the west.
    expect(shadowCast({ altitudeDeg: 30, azimuthDeg: 90 }).bearingDeg).toBeCloseTo(270, 6);
    expect(shadowCast({ altitudeDeg: 20, azimuthDeg: 300 }).bearingDeg).toBeCloseTo(120, 6);

    const low = shadowCast({ altitudeDeg: 10, azimuthDeg: 90 });
    const high = shadowCast({ altitudeDeg: 60, azimuthDeg: 90 });
    expect(low.lengthPerMeter).toBeGreaterThan(high.lengthPerMeter);
  });

  it("keeps a sun on the horizon from throwing an infinitely long shadow", () => {
    const grazing = shadowCast({ altitudeDeg: 0.01, azimuthDeg: 90 });

    expect(grazing.isLit).toBe(true);
    expect(Number.isFinite(grazing.lengthPerMeter)).toBe(true);
  });

  it("casts nothing once the sun is down", () => {
    const night = shadowCast({ altitudeDeg: -3, azimuthDeg: 280 });

    expect(night.isLit).toBe(false);
    expect(night.lengthPerMeter).toBe(0);
  });
});
