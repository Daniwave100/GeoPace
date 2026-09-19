// Where the Ride's camera is, and which way it looks, for a place on the course (PLAN.md D33,
// issue #8). Pure geometry, no CesiumJS: the view is worked out from the course line and the km
// alone, so the same km always gives the same view, whether the Ride got there by playing, by
// Back, or by a hand on the strip.
//
// Every height here is the Course Bundle's own height above the ellipsoid, or, on the keyless
// map, our own open terrain's (the caller says which, through `heightAt`). Nothing is ever read
// from photoreal imagery, which is for looking at only (PLAN.md D5).
import type { CourseLine } from "../bundle/types";
import { relativeBearing } from "./bearing";
import { cruising, type RideCamera, type RideCourse } from "./ride";
import { positionAtKm, type RoadPosition } from "./scrub";

/**
 * On the road: how far above the road the camera rides. The one setting issue #8 asks for. A lead
 * vehicle's camera height: the imagery sets no floor (PLAN.md D33), and the Queensboro's lower
 * deck, which runners use, has only about 4 m of room under the upper one.
 */
export const ON_THE_ROAD_HEIGHT_M = 3;

const ON_THE_ROAD = {
  /** How far behind the runner the camera follows, along the road itself, so it is never inside a building on a corner. */
  behindM: 25,
  /** It looks at the road's height this far ahead of the runner: up a climb looks up, over a crest looks down. */
  aheadM: 50,
  /**
   * The stretch of road whose direction the camera faces, from behind the runner to ahead of them.
   * The longer it is, the slower the view swings through a corner: a city block's 90° takes 200 m
   * of road, which at the cruise is under two seconds. Mostly ahead, so the camera turns into a
   * corner as the runner reaches it.
   */
  facing: { behindM: 60, aheadM: 140 },
};

const FROM_ABOVE = {
  /** Degrees below the horizon: enough tilt for the city to read as 3D, enough height to read the course like a map. */
  tiltDeg: 50,
  /** How far from the runner the camera is: close at a Stop, further off at the cruise, where the ground goes by quicker. */
  rangeAtAStopM: 900,
  rangeAtTheCruiseM: 2200,
  /**
   * The way the course is going, over 3 km of it: it faces along the straight line from 1 km behind
   * the runner to 2 km ahead. Zigzags of city blocks even out, the loop onto the Queensboro Bridge
   * goes by unnoticed, and a real change of direction is a slow sweep.
   */
  facing: { behindM: 1000, aheadM: 2000 },
};

const M_PER_DEG_LAT = 111_320;
const RAD = Math.PI / 180;

/** As much of a course as the camera needs: the course line, and where the Stops are. */
export interface RideScene {
  line: CourseLine;
  /** In course order (core/stops.ts). */
  stops: { km: number }[];
}

export interface RideView {
  /** Where the camera is. `heightM` is above the ellipsoid: where the 3D scene counts heights from. */
  eye: { lat: number; lon: number; heightM: number };
  /** Which way it looks: degrees clockwise from true north. */
  headingDeg: number;
  /** Degrees above the horizon: negative looks down. */
  pitchDeg: number;
}

/** The road's height in the scene at a place on the course. */
export type HeightAt = (place: RoadPosition) => number;

export interface RideViewOptions {
  /** The road's height in the scene: left out, the Course Bundle's own height above the ellipsoid. */
  heightAt?: HeightAt;
  /**
   * From above: how far to the runner's left the camera looks, as a fraction of its distance from
   * them. The readout block covers the left of the map, so the middle of the map is not the middle
   * of what the runner can see (core/framing.ts); looking a little left puts them there.
   */
  leftOfRunner?: number;
}

/** The spacing of the course line's samples, near enough: a view's swing is measured from one to the next. */
const SWING_OVER_KM = 0.01;

/**
 * The course as the Ride needs it: its length, its Stops, and how far each camera's view swings
 * round for the course that goes by, so the Ride can ease off through a sharp turn.
 */
export function rideCourseFor(scene: RideScene): RideCourse {
  const swing = (km: number, camera: RideCamera) => Math.abs(relativeBearing(headingAt(scene.line, km, camera), headingAt(scene.line, km + SWING_OVER_KM, camera))) / SWING_OVER_KM;
  return {
    lengthKm: scene.line.length_m / 1000,
    stops: scene.stops,
    // The most of the 10 m behind, the 10 m ahead and the 10 m after that: eased off a moment before the turn, not during it.
    swingDegPerKm: (km, camera) => Math.max(swing(km - SWING_OVER_KM, camera), swing(km, camera), swing(km + SWING_OVER_KM, camera)),
  };
}

/** Which way a camera faces at `km`. */
function headingAt(line: CourseLine, km: number, camera: RideCamera): number {
  if (camera === "on-the-road") return facingDeg(line, km, ON_THE_ROAD.facing);
  return bearingDeg(placeAlong(line, km - FROM_ABOVE.facing.behindM / 1000), placeAlong(line, km + FROM_ABOVE.facing.aheadM / 1000));
}

export function rideView(scene: RideScene, km: number, camera: RideCamera, options: RideViewOptions = {}): RideView {
  const { line } = scene;
  const heightAt = options.heightAt ?? ((place: RoadPosition) => place.ellipsoidHeightM);
  const runner = positionAtKm(line, km);
  const headingDeg = headingAt(line, km, camera);

  if (camera === "on-the-road") {
    const eye = placeAlong(line, km - ON_THE_ROAD.behindM / 1000);
    const heightM = heightAt(eye) + ON_THE_ROAD_HEIGHT_M;
    const ahead = positionAtKm(line, km + ON_THE_ROAD.aheadM / 1000);
    return { eye: { lat: eye.lat, lon: eye.lon, heightM }, headingDeg, pitchDeg: Math.atan2(heightAt(ahead) - heightM, ON_THE_ROAD.behindM + ON_THE_ROAD.aheadM) / RAD };
  }

  const course = { lengthKm: line.length_m / 1000, stops: scene.stops };
  const rangeM = FROM_ABOVE.rangeAtAStopM + (FROM_ABOVE.rangeAtTheCruiseM - FROM_ABOVE.rangeAtAStopM) * cruising(course, km, camera);
  // Back from the runner the way the camera faces, and up: the runner is in the middle of the view,
  // or, with the camera moved to its own left, as far right of the middle as was asked for.
  const behind = moved(runner, headingDeg + 180, rangeM * Math.cos(FROM_ABOVE.tiltDeg * RAD));
  const eye = moved(behind, headingDeg - 90, rangeM * (options.leftOfRunner ?? 0));
  return { eye: { ...eye, heightM: heightAt(runner) + rangeM * Math.sin(FROM_ABOVE.tiltDeg * RAD) }, headingDeg, pitchDeg: -FROM_ABOVE.tiltDeg };
}

/**
 * The place on the course line at `km`, carried straight on past either end: behind the start
 * line there is no course to stand on, and the camera still has to be behind the runner.
 */
function placeAlong(line: CourseLine, km: number): RoadPosition {
  const lengthKm = line.km[line.km.length - 1];
  const onTheLine = positionAtKm(line, km);
  const beyondKm = km < line.km[0] ? km - line.km[0] : km > lengthKm ? km - lengthKm : 0;
  return beyondKm === 0 ? onTheLine : { ...onTheLine, ...moved(onTheLine, onTheLine.bearingDeg, beyondKm * 1000) };
}

/** `meters` from a place in the direction `bearingDeg`. Flat-earth arithmetic: good to centimetres over the few kilometres a view spans. */
function moved(from: { lat: number; lon: number }, bearingDeg: number, meters: number): { lat: number; lon: number } {
  return {
    lat: from.lat + (meters * Math.cos(bearingDeg * RAD)) / M_PER_DEG_LAT,
    lon: from.lon + (meters * Math.sin(bearingDeg * RAD)) / (M_PER_DEG_LAT * Math.cos(from.lat * RAD)),
  };
}

/** The direction from one place to another, degrees clockwise from true north. Flat-earth arithmetic, like `moved`. */
function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const north = (to.lat - from.lat) * M_PER_DEG_LAT;
  const east = (to.lon - from.lon) * M_PER_DEG_LAT * Math.cos(from.lat * RAD);
  return ((Math.atan2(east, north) / RAD) + 360) % 360;
}

/**
 * The way the road is going around `km`: the mean of its heading from `behindM` behind to
 * `aheadM` ahead. A mean of headings, not the direction of the straight line between the two ends:
 * on a hairpin (New York has two, on and off the Queensboro Bridge) the two ends are side by side
 * and that line spins round in a few metres.
 */
function facingDeg(line: CourseLine, km: number, facing: { behindM: number; aheadM: number }): number {
  const sums = headingSums(line);
  const last = line.km.length - 1;
  // In samples, which are evenly spaced; the stretch is cut off at the ends of the course.
  const perKm = last / (line.km[last] - line.km[0]);
  const from = Math.max((km - line.km[0] - facing.behindM / 1000) * perKm, 0);
  const to = Math.min((km - line.km[0] + facing.aheadM / 1000) * perKm, last);
  const sumTo = (at: number) => {
    const whole = Math.min(Math.floor(at), last - 1);
    return sums[whole] + (sums[whole + 1] - sums[whole]) * (at - whole);
  };
  const mean = to > from ? (sumTo(to) - sumTo(from)) / (to - from) : sums[1] - sums[0];
  return ((mean % 360) + 360) % 360;
}

/** For each course line, the running total of its heading sample by sample, so a mean over any stretch is two lookups. Worked out once. */
const SUMS = new WeakMap<CourseLine, number[]>();

function headingSums(line: CourseLine): number[] {
  let sums = SUMS.get(line);
  if (!sums) {
    sums = [0];
    // The heading with the turns added up rather than wrapped at 360: north by east by south is
    // 0, 90, 180, and once more round is 360, so a mean across a turn is the way between.
    let unwrapped = line.bearing_deg[0];
    line.bearing_deg.forEach((bearing, i) => {
      if (i > 0) unwrapped += ((((bearing - line.bearing_deg[i - 1]) % 360) + 540) % 360) - 180;
      sums!.push(sums![i] + unwrapped);
    });
    SUMS.set(line, sums);
  }
  return sums;
}
