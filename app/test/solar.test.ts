// Seam: an instant + a place on Earth -> where the sun is in the sky.
// Every expectation here comes from textbook solar geometry, never from re-running the algorithm:
// at solar noon the sun bears due south, and its height is 90° - latitude, tilted by the season.
import { describe, expect, it } from "vitest";
import { sunPosition } from "../src/core/solar";

const BERLIN = { lat: 52.5163, lon: 13.3777 };
const EARTHS_TILT_DEG = 23.44;

/** The highest the sun gets on a UTC day, found by sampling. That moment *is* solar noon. */
function highestSun(startOfDayUtc: string, lat: number, lon: number) {
  const start = Date.parse(startOfDayUtc);
  let best = { altitudeDeg: -Infinity, azimuthDeg: 0, at: new Date(start) };
  for (let second = 0; second < 24 * 60 * 60; second += 10) {
    const at = new Date(start + second * 1000);
    const sun = sunPosition(at, lat, lon);
    if (sun.altitudeDeg > best.altitudeDeg) best = { ...sun, at };
  }
  return best;
}

describe("sun position", () => {
  it("puts the midday sun due south, as high as the latitude and the season allow", () => {
    const june = highestSun("2026-06-21T00:00:00Z", BERLIN.lat, BERLIN.lon);
    const december = highestSun("2026-12-21T00:00:00Z", BERLIN.lat, BERLIN.lon);

    // North of the tropics, the sun bears due south at solar noon, whatever the season.
    expect(june.azimuthDeg).toBeCloseTo(180, 0);
    expect(december.azimuthDeg).toBeCloseTo(180, 0);
    // Noon height is (90° - latitude), raised or lowered by the Earth's tilt. So the two
    // solstices sit symmetrically either side of it: their sum cancels the tilt out...
    expect(june.altitudeDeg + december.altitudeDeg).toBeCloseTo(180 - 2 * BERLIN.lat, 0);
    // ...and their difference is twice the tilt, wherever you stand.
    expect(june.altitudeDeg - december.altitudeDeg).toBeCloseTo(2 * EARTHS_TILT_DEG, 0);
  });

  it("rises due east and sets due west on the equinox, and stays below the horizon at night", () => {
    // On the equinox the sun sits over the equator, so it rises due east and sets due west from
    // anywhere on Earth. That pins the azimuth away from noon, where a sign error would hide.
    const equinox = "2026-09-23T00:00:00Z";
    expect(azimuthAtHorizon(equinox, BERLIN, "rising")).toBeCloseTo(90, -0.5);
    expect(azimuthAtHorizon(equinox, BERLIN, "setting")).toBeCloseTo(270, -0.5);

    // Local midnight in Berlin (CEST, UTC+2) is the far side of the world from the sun.
    expect(sunPosition(new Date("2026-09-23T22:00:00Z"), BERLIN.lat, BERLIN.lon).altitudeDeg).toBeLessThan(-20);
  });

  it("tracks the sun across a real race morning: east at the start, climbing, south by midday", () => {
    // Berlin Marathon 2026, 09:15 CEST — the wave is heading out with the sun low behind them.
    const start = sunPosition(new Date("2026-09-27T07:15:00Z"), BERLIN.lat, BERLIN.lon);
    const noon = sunPosition(new Date("2026-09-27T10:00:00Z"), BERLIN.lat, BERLIN.lon);

    expect(start.azimuthDeg).toBeGreaterThan(90); // east of due east: the sun rose a while ago
    expect(start.azimuthDeg).toBeLessThan(noon.azimuthDeg); // and keeps swinging round towards south
    expect(noon.azimuthDeg).toBeLessThan(180);
    expect(start.altitudeDeg).toBeGreaterThan(0);
    expect(noon.altitudeDeg).toBeGreaterThan(start.altitudeDeg);
  });
});

/** The sun's bearing at the moment its geometric altitude crosses the horizon. */
function azimuthAtHorizon(startOfDayUtc: string, at: { lat: number; lon: number }, edge: "rising" | "setting"): number {
  const start = Date.parse(startOfDayUtc);
  let closest = { azimuthDeg: NaN, distanceFromHorizon: Infinity };
  for (let second = 0; second < 24 * 60 * 60; second += 10) {
    const now = new Date(start + second * 1000);
    const next = new Date(start + (second + 10) * 1000);
    const here = sunPosition(now, at.lat, at.lon);
    const later = sunPosition(next, at.lat, at.lon);
    const crossing = edge === "rising" ? here.altitudeDeg < 0 && later.altitudeDeg >= 0 : here.altitudeDeg >= 0 && later.altitudeDeg < 0;
    if (crossing && Math.abs(here.altitudeDeg) < closest.distanceFromHorizon) {
      closest = { azimuthDeg: here.azimuthDeg, distanceFromHorizon: Math.abs(here.altitudeDeg) };
    }
  }
  return closest.azimuthDeg;
}
