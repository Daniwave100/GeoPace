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
  return { line: bundle.measured.course_line, stops: stopsFor(bundle), notMeasured: bundle.measured.elevation_not_measured };
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
  return { line, stops: [{ km: 0 }, { km: 4 }], notMeasured: [] };
}

/**
 * 3 km due north: up at 2% for the first km, then a 1 km bridge whose deck nobody scanned, filled
 * in as a straight level line, then down at 3%. A real bridge between those two grades crests over the fill.
 */
function bridgeCourse(): RideScene {
  const km = Array.from({ length: 301 }, (_, i) => i / 100);
  const grade = km.map((at) => (at < 1 ? 0.02 : at < 2 ? 0 : -0.03));
  const height: number[] = [];
  km.forEach((_, i) => height.push(i === 0 ? 100 : height[i - 1] + grade[i - 1] * 10));
  const line: CourseLine = {
    spacing_m: 10,
    length_m: 3000,
    km,
    lat: km.map((at) => 52.5 + (at * 1000) / M_PER_DEG_LAT),
    lon: km.map(() => 13.4),
    elevation_m: height.map((h) => h - 39.5),
    ellipsoid_height_m: height,
    grade,
    difficulty: grade.map(() => 1),
    bearing_deg: km.map(() => 0),
  };
  return { line, stops: [{ km: 0 }, { km: 3 }], notMeasured: [{ km_start: 1, km_end: 2, reason: "The scan has a gap here." }] };
}

/** Metres north and east of `from` to `to`: good to a centimetre over the few hundred metres used here. */
function metersFrom(from: { lat: number; lon: number }, to: { lat: number; lon: number }): { north: number; east: number } {
  return { north: (to.lat - from.lat) * M_PER_DEG_LAT, east: (to.lon - from.lon) * M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180) };
}

/**
 * The fastest the view swings round anywhere on a course, in degrees a second, at the speed the
 * Ride goes there; walked a metre at a time, because round Columbus Circle the whole swing falls
 * within some 4 m. Places where the Ride is already as slow as it is allowed to go are left out:
 * there the swing is whatever the road demands (PLAN.md D53).
 */
function fastestSwingDegPerS(scene: RideScene, camera: RideCamera): { degPerS: number; km: number } {
  const course = rideCourseFor(scene);
  const asSlowAsItGoes = { ...course, swingDegPerKm: () => Number.MAX_VALUE };
  let fastest = { degPerS: 0, km: 0 };
  let last = rideView(scene, 0, camera).headingDeg;
  for (let m = 1; m <= course.lengthKm * 1000; m += 1) {
    const km = m / 1000;
    const heading = rideView(scene, km, camera).headingDeg;
    const speed = rideSpeedKmPerS(course, km, camera);
    // Degrees in a metre of road, times how many metres go by in a second.
    const degPerS = Math.abs(relativeBearing(last, heading)) * speed * 1000;
    if (degPerS > fastest.degPerS && speed > rideSpeedKmPerS(asSlowAsItGoes, km, camera) * 1.001) fastest = { degPerS, km };
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
    // A quarter turn takes a second and a half at the least (60° a second, and a little over for
    // measuring it 10 m at a time). The Ride eases off to keep to it at every street corner, where
    // corners come in a row (New York's mile in the Bronx), and where the road loops (the Queensboro Bridge).
    for (const scene of [cornerCourse(), nyc, berlin]) {
      const fastest = fastestSwingDegPerS(scene, "on-the-road");
      expect(fastest.degPerS, `km ${fastest.km.toFixed(2)}`).toBeLessThan(75);
    }
  });

  it("keeps the runner in the middle of the view round every corner, hairpin and loop of both courses", () => {
    for (const scene of [cornerCourse(), nyc, berlin]) {
      const lengthKm = scene.line.length_m / 1000;
      for (let km = 0; km <= lengthKm; km += 0.01) {
        const view = rideView(scene, km, "on-the-road");
        const toRunner = metersFrom(view.eye, positionAtKm(scene.line, km));
        const toRunnerDeg = (Math.atan2(toRunner.east, toRunner.north) * 180) / Math.PI;
        // CesiumJS's view is 60° across: more than 30° off the way the camera faces is out of shot.
        expect(Math.abs(relativeBearing(view.headingDeg, toRunnerDeg)), `km ${km.toFixed(2)}`).toBeLessThan(5);
        // And up and down: where the road doubles back the runner is a few metres from a camera 3 m
        // up, far below the horizon. The view is some 36° top to bottom; the camera looks at the
        // road the runner is on. (The bundle's own height: over a filled-in stretch the camera
        // allows for a crest the dot isn't drawn on, which is a few degrees.)
        const flatM = Math.hypot(toRunner.north, toRunner.east);
        const downToRunnerDeg = (Math.atan2(positionAtKm(scene.line, km).ellipsoidHeightM - view.eye.heightM, Math.max(flatM, 1)) * 180) / Math.PI;
        expect(Math.abs(view.pitchDeg - downToRunnerDeg), `km ${km.toFixed(2)}, up and down`).toBeLessThan(12);
      }
    }
  });

  it("still has the runner in shot where New York doubles back on itself at Columbus Circle, a metre at a time", () => {
    for (let m = 41_960; m <= 42_030; m += 1) {
      const km = m / 1000;
      const view = rideView(nyc, km, "on-the-road");
      const toRunner = metersFrom(view.eye, positionAtKm(nyc.line, km));
      const flatM = Math.hypot(toRunner.north, toRunner.east);
      const downToRunnerDeg = (Math.atan2(positionAtKm(nyc.line, km).ellipsoidHeightM - view.eye.heightM, Math.max(flatM, 1)) * 180) / Math.PI;
      expect(Math.abs(view.pitchDeg - downToRunnerDeg), `km ${km}`).toBeLessThan(12);
    }
  });

  it("stays on the road itself, so it is never inside a building on a corner", () => {
    for (const scene of [nyc, berlin]) {
      const { line } = scene;
      for (let km = 0.05; km <= line.length_m / 1000; km += 0.01) {
        const { eye } = rideView(scene, km, "on-the-road");
        const behind = positionAtKm(line, km - 0.025); // where a vehicle 25 m behind the runner would be
        const off = metersFrom(behind, eye);
        expect(Math.hypot(off.north, off.east), `km ${km.toFixed(2)}`).toBeLessThan(1);
      }
    }
  });

  it("faces the way the road goes on every straight, whichever way that is, due north included", () => {
    let straights = 0;
    for (const scene of [nyc, berlin]) {
      const { line } = scene;
      for (let i = 10; i < line.km.length - 10; i += 1) {
        const around = line.bearing_deg.slice(i - 6, i + 6);
        if (around.some((bearing) => Math.abs(relativeBearing(line.bearing_deg[i], bearing)) > 1)) continue; // not a straight
        straights += 1;
        const view = rideView(scene, line.km[i], "on-the-road");
        expect(Math.abs(relativeBearing(line.bearing_deg[i], view.headingDeg)), `km ${line.km[i]}`).toBeLessThan(3);
      }
    }
    expect(straights).toBeGreaterThan(3000); // most of both courses, New York's northbound avenues among them
  });

  it("looks up a climb and down a descent: the road ahead is what it looks at", () => {
    const scene = bridgeCourse();
    const onTheFlat = rideView(cornerCourse(), 1, "on-the-road").pitchDeg;

    expect(rideView(scene, 0.5, "on-the-road").pitchDeg).toBeGreaterThan(onTheFlat + 0.5); // climbing at 2%
    expect(rideView(scene, 2.5, "on-the-road").pitchDeg).toBeLessThan(onTheFlat - 0.5); // coming down at 3%
  });

  it("rides higher where the height is filled in, by as much as a bridge between those two grades would crest over the fill", () => {
    const scene = bridgeCourse();
    const over = (km: number) => rideView(scene, km, "on-the-road").eye.heightM - positionAtKm(scene.line, km - 0.025).ellipsoidHeightM;

    expect(over(0.5)).toBeCloseTo(ON_THE_ROAD_HEIGHT_M, 6); // measured road: the one setting
    expect(over(2.5)).toBeCloseTo(ON_THE_ROAD_HEIGHT_M, 6);
    // Up at 2%, down at 3%, 1000 m between: a road's curve between them crests (0.02 + 0.03) x 1000 / 8 = 6.25 m over the straight fill.
    expect(over(1.525)).toBeCloseTo(ON_THE_ROAD_HEIGHT_M + 6.25, 1);
    expect(over(1.275)).toBeCloseTo(ON_THE_ROAD_HEIGHT_M + 6.25 * 0.75, 1); // a quarter of the way: three quarters of the crest
  });

  it("never rides lower for a filled-in dip: down into it and up out of it, the fill is already the high line", () => {
    const scene = bridgeCourse();
    scene.line.grade = scene.line.grade.map((grade) => -grade);

    const over = rideView(scene, 1.525, "on-the-road").eye.heightM - positionAtKm(scene.line, 1.5).ellipsoidHeightM;

    expect(over).toBeCloseTo(ON_THE_ROAD_HEIGHT_M, 6);
  });

  it("clears the Verrazzano's unscanned main span, which the plan says is a few metres under the real deck", () => {
    const midSpan = 1.065; // the middle of km 0.77 to 1.36
    const eye = rideView(nyc, midSpan + 0.025, "on-the-road").eye.heightM;
    const filledIn = positionAtKm(nyc.line, midSpan).ellipsoidHeightM;

    expect(eye - filledIn).toBeGreaterThan(ON_THE_ROAD_HEIGHT_M + 2.5);
    expect(eye - filledIn).toBeLessThan(ON_THE_ROAD_HEIGHT_M + 6);
  });

  it("rides at the road's own height above the ellipsoid: on the Verrazzano's measured approach, not at sea level, and tens of metres up in Berlin", () => {
    // Sea level is about 32.5 m below the ellipsoid in New York and 39.5 m above it in Berlin (PLAN.md D51).
    // Km 0.6 is on the bridge's approach, where the LiDAR measured the deck (the unscanned span begins at km 0.77).
    const onTheBridge = rideView(nyc, 0.6, "on-the-road").eye.heightM;
    const inBerlin = rideView(berlin, 10, "on-the-road").eye.heightM;

    expect(onTheBridge).toBeGreaterThan(20); // the deck is tens of metres over the water: at sea level this would be about -30
    expect(onTheBridge).toBeLessThan(50);
    expect(inBerlin).toBeGreaterThan(70); // streets 30 to 50 m above sea level, plus 39.5
    expect(inBerlin).toBeLessThan(95);
  });

  it("takes the road's height from whoever is asked for it: on the keyless map, the open terrain", () => {
    const view = rideView(cornerCourse(), 1, "on-the-road", { heightAt: () => 12 });

    expect(view.eye.heightM).toBeCloseTo(12 + ON_THE_ROAD_HEIGHT_M, 6);
    // And exactly that, even over a filled-in stretch: the crest is a guess about our own survey's
    // gap, and the terrain the course is draped on has no bridge in it to crest.
    expect(rideView(bridgeCourse(), 1.525, "on-the-road", { heightAt: () => 12 }).eye.heightM).toBeCloseTo(12 + ON_THE_ROAD_HEIGHT_M, 6);
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
