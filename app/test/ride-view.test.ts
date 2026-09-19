// Seam: the course line + a km + which camera -> where the Ride's camera is and which way it
// looks (issue #8). Pure geometry, no CesiumJS. The traps kept shut here: the camera's height
// comes from the Course Bundle's own heights above the ellipsoid (never sea level, never a
// surface read from imagery: PLAN.md D5, D51), and the view never swings round in a jolt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { CourseLine } from "../src/bundle/types";
import { relativeBearing } from "../src/core/bearing";
import { type RideCamera, rideSpeedKmPerS } from "../src/core/ride";
import { ON_THE_ROAD_HEIGHT_M, rideCourseFor, type RideScene, rideView } from "../src/core/ride-view";
import { positionAtKm } from "../src/core/scrub";
import { stopsFor } from "../src/core/stops";

const sceneFor = (id: string): RideScene => {
  const bundle = parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${id}/course-bundle.json`, import.meta.url), "utf8")), id);
  return { line: bundle.measured.course_line, stops: stopsFor(bundle) };
};
const nyc = sceneFor("nyc");
const berlin = sceneFor("berlin");

const M_PER_DEG_LAT = 111_320;

/** 2 km due north from 52.5°N 13.4°E, then 2 km due east, flat, 100 m above the ellipsoid. Samples every 10 m. */
function cornerCourse(): RideScene {
  const km = Array.from({ length: 401 }, (_, i) => i / 100);
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((52.5 * Math.PI) / 180);
  const line: CourseLine = {
    spacing_m: 10,
    length_m: 4000,
    km,
    lat: km.map((at) => 52.5 + (Math.min(at, 2) * 1000) / M_PER_DEG_LAT),
    lon: km.map((at) => 13.4 + (Math.max(at - 2, 0) * 1000) / mPerDegLon),
    elevation_m: km.map(() => 60.5),
    ellipsoid_height_m: km.map(() => 100),
    grade: km.map(() => 0),
    difficulty: km.map(() => 1),
    bearing_deg: km.map((at) => (at < 2 ? 0 : 90)),
  };
  return { line, stops: [{ km: 0 }, { km: 4 }] };
}

/** Metres north and east of `from` to `to`: good to a centimetre over the few hundred metres used here. */
function metersFrom(from: { lat: number; lon: number }, to: { lat: number; lon: number }): { north: number; east: number } {
  return { north: (to.lat - from.lat) * M_PER_DEG_LAT, east: (to.lon - from.lon) * M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180) };
}

/** The fastest the view swings round anywhere on a course, in degrees a second, at the speed the Ride goes there. */
function fastestSwingDegPerS(scene: RideScene, camera: RideCamera): { degPerS: number; km: number } {
  const course = rideCourseFor(scene);
  let fastest = { degPerS: 0, km: 0 };
  let last = rideView(scene, 0, camera).headingDeg;
  for (let km = 0.01; km <= course.lengthKm; km += 0.01) {
    const heading = rideView(scene, km, camera).headingDeg;
    // Degrees in 10 m of road, times how many tens of metres go by in a second.
    const degPerS = Math.abs(relativeBearing(last, heading)) * rideSpeedKmPerS(course, km, camera) * 100;
    if (degPerS > fastest.degPerS) fastest = { degPerS, km };
    last = heading;
  }
  return fastest;
}

describe("On the road", () => {
  it("follows from a few metres up and behind, looking along the road, slightly down", () => {
    const scene = cornerCourse();
    const view = rideView(scene, 1, "on-the-road");
    const runner = positionAtKm(scene.line, 1);

    const behind = metersFrom(runner, view.eye);
    expect(behind.north).toBeLessThan(-15); // south of a runner heading north
    expect(behind.north).toBeGreaterThan(-40);
    expect(Math.abs(behind.east)).toBeLessThan(0.5);
    expect(view.eye.heightM).toBeCloseTo(100 + ON_THE_ROAD_HEIGHT_M, 6);
    expect(Math.abs(relativeBearing(0, view.headingDeg))).toBeLessThan(0.5);
    expect(view.pitchDeg).toBeLessThan(0);
    expect(view.pitchDeg).toBeGreaterThan(-10);
  });

  it("is still behind the runner on the start line and on the finish line, where there is no road behind or ahead to follow", () => {
    const scene = cornerCourse();
    for (const km of [0, 0.01, 3.99, 4]) {
      const view = rideView(scene, km, "on-the-road");
      const runner = positionAtKm(scene.line, km);
      const behind = metersFrom(runner, view.eye);
      const alongTheRoad = km < 2 ? -behind.north : -behind.east;

      expect(alongTheRoad, `km ${km}`).toBeGreaterThan(15);
      expect(Math.abs(relativeBearing(km < 2 ? 0 : 90, view.headingDeg)), `km ${km}`).toBeLessThan(0.5);
      expect(Number.isFinite(view.pitchDeg)).toBe(true);
    }
  });

  it("turns into a corner gradually, never in a jolt, along the whole of both courses", () => {
    // A quarter turn takes two seconds at the least. The Ride eases off to keep to it where corners
    // come in a row (New York's mile in the Bronx) or the road loops (on and off the Queensboro Bridge).
    for (const scene of [cornerCourse(), nyc, berlin]) {
      const fastest = fastestSwingDegPerS(scene, "on-the-road");
      expect(fastest.degPerS, `km ${fastest.km.toFixed(2)}`).toBeLessThan(60);
    }
  });

  it("rides at the road's own height above the ellipsoid: on the Verrazzano's deck, not at sea level, and tens of metres up in Berlin", () => {
    // Sea level is about 32.5 m below the ellipsoid in New York and 39.5 m above it in Berlin (PLAN.md D51).
    const onTheBridge = rideView(nyc, 1.0, "on-the-road").eye.heightM;
    const inBerlin = rideView(berlin, 10, "on-the-road").eye.heightM;

    expect(onTheBridge).toBeGreaterThan(20); // the deck is some 60 m over the water: at sea level this would be about -30
    expect(onTheBridge).toBeLessThan(50);
    expect(inBerlin).toBeGreaterThan(70); // streets 30 to 50 m above sea level, plus 39.5
    expect(inBerlin).toBeLessThan(95);
  });

  it("takes the road's height from whoever is asked for it: on the keyless map, the open terrain", () => {
    const view = rideView(cornerCourse(), 1, "on-the-road", { heightAt: () => 12 });

    expect(view.eye.heightM).toBeCloseTo(12 + ON_THE_ROAD_HEIGHT_M, 6);
  });
});

describe("From above", () => {
  it("looks down on the runner from the air, with the runner in the middle of the view and the way ahead up the screen", () => {
    const scene = cornerCourse();
    const view = rideView(scene, 1, "from-above");
    const runner = positionAtKm(scene.line, 1);

    const back = metersFrom(runner, view.eye);
    expect(view.eye.heightM - 100).toBeGreaterThan(500);
    expect(view.pitchDeg).toBeLessThan(-35);
    expect(view.pitchDeg).toBeGreaterThan(-70);
    // The runner is where the camera points: as far in front of it as the camera is high, over the tangent of the pitch.
    const toRunnerDeg = (Math.atan2(-back.east, -back.north) * 180) / Math.PI;
    expect(Math.abs(relativeBearing(view.headingDeg, toRunnerDeg))).toBeLessThan(0.5);
    expect(Math.hypot(back.north, back.east)).toBeCloseTo((view.eye.heightM - 100) / Math.tan((-view.pitchDeg * Math.PI) / 180), 0);
  });

  it("can look to the runner's left, so the runner lands in the middle of the part of the map the readout block leaves clear", () => {
    const scene = cornerCourse();
    const runner = positionAtKm(scene.line, 1);
    const centred = rideView(scene, 1, "from-above");
    const fromTheRunner = metersFrom(runner, centred.eye);
    const range = Math.hypot(fromTheRunner.north, fromTheRunner.east, centred.eye.heightM - 100);

    const shifted = rideView(scene, 1, "from-above", { leftOfRunner: 0.1 });

    // The camera moves a tenth of its distance from the runner, square to the way it faces, to its own left, and turns nowhere.
    const moved = metersFrom(centred.eye, shifted.eye);
    const facing = (centred.headingDeg * Math.PI) / 180;
    const ahead = moved.north * Math.cos(facing) + moved.east * Math.sin(facing);
    const toTheRight = moved.east * Math.cos(facing) - moved.north * Math.sin(facing);
    expect(toTheRight).toBeCloseTo(-0.1 * range, 0);
    expect(Math.abs(ahead)).toBeLessThan(0.5);
    expect(shifted.headingDeg).toBeCloseTo(centred.headingDeg, 9);
    expect(shifted.eye.heightM).toBeCloseTo(centred.eye.heightM, 9);
  });

  it("comes down for a closer look at a Stop, and goes up again between Stops", () => {
    const atTheBarclaysCenter = rideView(nyc, 12.1, "from-above");
    const onFourthAvenue = rideView(nyc, 6, "from-above");

    expect(atTheBarclaysCenter.eye.heightM).toBeLessThan(onFourthAvenue.eye.heightM / 1.5);
  });

  it("turns with the course slowly: a change of direction is a sweep of several seconds, not a spin", () => {
    for (const scene of [cornerCourse(), nyc, berlin]) {
      const fastest = fastestSwingDegPerS(scene, "from-above");
      expect(fastest.degPerS, `km ${fastest.km.toFixed(2)}`).toBeLessThan(30);
    }
  });
});
