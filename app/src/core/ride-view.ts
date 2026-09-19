// Where the Ride's camera is, and which way it looks, for a place on the course (PLAN.md D33,
// issue #8). Pure geometry, no CesiumJS: the view is worked out from the course line and the km
// alone, so the same km always gives the same view, whether the Ride got there by playing, by
// Back, or by a hand on the strip.
//
// Every height here is the Course Bundle's own height above the ellipsoid, or, on the keyless
// map, our own open terrain's (the caller says which, through `heightAt`). Nothing is ever read
// from photoreal imagery, which is for looking at only (PLAN.md D5).
import type { CourseLine, NotMeasuredSpan } from "../bundle/types";
import { relativeBearing } from "./bearing";
import type { RideCamera, RideCourse } from "./ride";
import { positionAtKm, type RoadPosition } from "./scrub";

/**
 * On the road: how far above the road the camera rides. The one setting issue #8 asks for. A lead
 * vehicle's camera height: the imagery sets no floor (PLAN.md D33), and it has to fit under the
 * Queensboro's upper deck, which the LiDAR puts 6.4 m above the lower one runners use (D23),
 * its own structure included.
 */
export const ON_THE_ROAD_HEIGHT_M = 3;

const ON_THE_ROAD = {
  /**
   * How far behind the runner the camera follows, along the road itself: where a vehicle behind
   * them would be. On the road, it is never inside a building on a corner. It looks at the runner,
   * so they are always in the middle of the view, round any corner, hairpin or loop; how fast the
   * view swings round is kept down by the Ride easing off through the turn (core/ride.ts), the way
   * a vehicle slows into a corner.
   */
  behindM: 25,
};

/**
 * Where the height is filled in, the road was not surveyed: the Course Bundle holds a straight
 * line between the measured heights either side (PLAN.md D45), and a bridge that is climbed on
 * to and descended from crests above that line (§5 says so of the Verrazzano's main span: "the
 * real crest is a few meters higher"). Three metres over the fill would put the camera in the
 * deck. So there the camera rides over an estimate of the crest: a road's curve between two grades
 * is near enough a parabola, which rises (grade in - grade out) x length / 8 over the straight
 * line at its middle. The grades are read this far outside the stretch, clear of the 50 m
 * smoothing that blends the fill into its ends. It is an estimate for keeping the camera out of
 * the road, and nothing else: never shown, and never where a height is measured.
 */
const GRADE_READ_KM = { from: 0.05, to: 0.15 };

const FROM_ABOVE = {
  /** Degrees below the horizon: enough tilt for the city to read as 3D, enough height to read the course like a map. */
  tiltDeg: 50,
  /**
   * How far from the runner the camera is, all the way: at a Stop, up a climb and on the open road
   * alike. First built coming down to 900 m at every Stop and back up to 2,200 m after it, which in
   * New York is eighteen times: the owner, after riding both, keeps it at one level (issue #24).
   * A Stop is still marked: the strip and the player name it as it goes by.
   */
  rangeM: 1500,
  /**
   * The way the course is going, over 3 km of it: it faces along the straight line from 1 km behind
   * the runner to 2 km ahead. Zigzags of city blocks even out, the loop onto the Queensboro Bridge
   * goes by unnoticed, and a real change of direction is a slow sweep.
   */
  facing: { behindM: 1000, aheadM: 2000 },
  /**
   * The most the view turns for the course that goes by, degrees per km: at the Ride's one pace
   * from above, 450 m a second (core/ride.ts), 18 degrees a second. Where the course doubles back
   * within those 3 km (New York's last two, round the foot of Central Park) the two ends of that
   * line come close together and it spins, at that pace faster than 90 degrees a second. The Ride
   * used to slow down there; since the owner asked for one pace all the way (issue #24) the camera
   * is held back instead: it begins its turn a little early and ends it a little late. The runner
   * stays in the middle of the view whichever way it faces.
   */
  mostTurnDegPerKm: 40,
};

const M_PER_DEG_LAT = 111_320;
const RAD = Math.PI / 180;

/** As much of a course as the Ride's cameras and its time-lapse need: the course line, where the Stops are (On the road the Ride slows for them; no camera looks at them), and where the height is filled in. */
export interface RideScene {
  line: CourseLine;
  /** In course order (core/stops.ts). */
  stops: { km: number }[];
  /** Where the height is filled in rather than measured (the Course Bundle's `elevation_not_measured`). */
  notMeasured: NotMeasuredSpan[];
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

/** A place in the 3D scene: `heightM` is above the ellipsoid, where the scene counts heights from. */
export interface ScenePlace {
  lat: number;
  lon: number;
  heightM: number;
}

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

/**
 * How far a camera's view swings round for the course that goes by, worked out a metre at a time:
 * where New York doubles back on itself at Columbus Circle the whole swing falls within some 4 m,
 * and measured 10 m at a time it fell between two measurements, so the Ride sped up at its apex.
 * The Ride is given the most of it from 10 m behind the runner to 20 m ahead: eased off a moment
 * before the turn, not during it.
 */
const SWING_LOOK_M = { behind: 10, ahead: 20 };

/** For each course line and camera, the swing at every metre, degrees per km. Worked out once: the Ride asks on every frame. */
const SWINGS = new WeakMap<CourseLine, Partial<Record<RideCamera, Float64Array>>>();

function swingsAlong(line: CourseLine, camera: RideCamera): Float64Array {
  const forThisLine = SWINGS.get(line) ?? {};
  SWINGS.set(line, forThisLine);
  let swings = forThisLine[camera];
  if (!swings) {
    const meters = Math.ceil(line.length_m);
    const headings = Array.from({ length: meters + SWING_LOOK_M.ahead + 2 }, (_, m) => headingAt(line, (m - SWING_LOOK_M.behind) / 1000, camera));
    const perMetre = headings.slice(1).map((heading, i) => Math.abs(relativeBearing(headings[i], heading)) * 1000);
    // perMetre[i] is the swing from (i - behind) m to the next metre, so the window for metre m is i = m .. m + behind + ahead.
    swings = Float64Array.from({ length: meters + 1 }, (_, m) => Math.max(...perMetre.slice(m, m + SWING_LOOK_M.behind + SWING_LOOK_M.ahead)));
    forThisLine[camera] = swings;
  }
  return swings;
}

/**
 * The course as the Ride needs it: its length, its Stops, and how far each camera's view swings
 * round for the course that goes by, so the Ride can ease off through a sharp turn.
 */
export function rideCourseFor(scene: RideScene): RideCourse {
  return {
    lengthKm: scene.line.length_m / 1000,
    stops: scene.stops,
    swingDegPerKm: (km, camera) => {
      const swings = swingsAlong(scene.line, camera);
      return swings[Math.min(Math.max(Math.round(km * 1000), 0), swings.length - 1)];
    },
  };
}

/** Which way a camera faces at `km`: On the road, at the runner from the road behind them; From above, the way the course is going. */
function headingAt(line: CourseLine, km: number, camera: RideCamera): number {
  if (camera === "on-the-road") return bearingDeg(placeAlong(line, km - ON_THE_ROAD.behindM / 1000), placeAlong(line, km));
  const facings = facingsAlong(line);
  const at = Math.min(Math.max(km * 1000, 0), facings.length - 1);
  const before = Math.floor(at);
  const after = Math.min(before + 1, facings.length - 1);
  return (((facings[before] + (facings[after] - facings[before]) * (at - before)) % 360) + 360) % 360;
}

/** For each course line, which way From above faces at every metre: degrees, counted on past 360 rather than wrapped, so that they can be told apart and averaged. Worked out once: the camera asks on every frame. */
const FACINGS = new WeakMap<CourseLine, Float64Array>();

/**
 * From above's facing along a course: the way the course is going over 3 km, turning no faster
 * than `mostTurnDegPerKm`. A turn that would be faster is spread over the road before it and after
 * it alike: the facing that follows the course as fast as it may, and the one that, read from the
 * finish backwards, leads it as early as it must, each keep to the bound, and so does the mean of
 * the two. Wherever the course turns slowly enough, all three are the same. Still a plain function
 * of the km: the same place gives the same view, however the Ride got there.
 */
function facingsAlong(line: CourseLine): Float64Array {
  let facings = FACINGS.get(line);
  if (!facings) {
    const meters = Math.ceil(line.length_m);
    const theWayTheCourseGoes = (m: number) => bearingDeg(placeAlong(line, (m - FROM_ABOVE.facing.behindM) / 1000), placeAlong(line, (m + FROM_ABOVE.facing.aheadM) / 1000));
    const wanted = new Float64Array(meters + 1);
    wanted[0] = theWayTheCourseGoes(0);
    for (let m = 1; m <= meters; m += 1) wanted[m] = wanted[m - 1] + relativeBearing(wanted[m - 1], theWayTheCourseGoes(m));
    const most = FROM_ABOVE.mostTurnDegPerKm / 1000;
    const following = Float64Array.from(wanted);
    for (let m = 1; m <= meters; m += 1) following[m] = Math.min(Math.max(wanted[m], following[m - 1] - most), following[m - 1] + most);
    const leading = Float64Array.from(wanted);
    for (let m = meters - 1; m >= 0; m -= 1) leading[m] = Math.min(Math.max(wanted[m], leading[m + 1] - most), leading[m + 1] + most);
    facings = following.map((follows, m) => (follows + leading[m]) / 2);
    FACINGS.set(line, facings);
  }
  return facings;
}

/**
 * The road's height at a place on the course: whatever the caller says it is (the open terrain the
 * course is draped on, which has no bridge in it to crest), or else the Course Bundle's own, and
 * over a stretch where that is filled in, our estimate of how far the real road crests above it.
 */
function roadHeightM(scene: RideScene, place: RoadPosition, atKm: number, options: RideViewOptions): number {
  return options.heightAt?.(place) ?? place.ellipsoidHeightM + crestOverTheFillM(scene, atKm);
}

/**
 * Where the runner is in the scene: on the course line, at the road's height there. What free look
 * turns the camera round (issue #28, PLAN.md D54), and the same height the Ride's own cameras ride
 * over; ⛔ never read from photoreal imagery (PLAN.md D5).
 */
export function runnerInTheScene(scene: RideScene, km: number, options: RideViewOptions = {}): ScenePlace {
  const runner = positionAtKm(scene.line, km);
  return { lat: runner.lat, lon: runner.lon, heightM: roadHeightM(scene, runner, km, options) };
}

export function rideView(scene: RideScene, km: number, camera: RideCamera, options: RideViewOptions = {}): RideView {
  const { line } = scene;
  const roadM = (place: RoadPosition, atKm: number) => roadHeightM(scene, place, atKm, options);
  const runner = positionAtKm(line, km);
  const headingDeg = headingAt(line, km, camera);

  if (camera === "on-the-road") {
    const eyeKm = km - ON_THE_ROAD.behindM / 1000;
    const eye = placeAlong(line, eyeKm);
    const heightM = roadM(eye, eyeKm) + ON_THE_ROAD_HEIGHT_M;
    // It looks at the road where the runner is: up a climb it looks up, over a crest it looks down,
    // and where the road doubles back, so that the runner is a few metres away, well down at them.
    const toRunnerM = Math.max(flatDistanceM(eye, runner), 1);
    return { eye: { lat: eye.lat, lon: eye.lon, heightM }, headingDeg, pitchDeg: Math.atan2(roadM(runner, km) - heightM, toRunnerM) / RAD };
  }

  const { rangeM } = FROM_ABOVE;
  // Back from the runner the way the camera faces, and up: the runner is in the middle of the view,
  // or, with the camera moved to its own left, as far right of the middle as was asked for.
  const behind = moved(runner, headingDeg + 180, rangeM * Math.cos(FROM_ABOVE.tiltDeg * RAD));
  const eye = moved(behind, headingDeg - 90, rangeM * (options.leftOfRunner ?? 0));
  return { eye: { ...eye, heightM: roadM(runner, km) + rangeM * Math.sin(FROM_ABOVE.tiltDeg * RAD) }, headingDeg, pitchDeg: -FROM_ABOVE.tiltDeg };
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

/** How far it is over the ground from one place to another. Flat-earth arithmetic, like `moved`. */
function flatDistanceM(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  return Math.hypot((to.lat - from.lat) * M_PER_DEG_LAT, (to.lon - from.lon) * M_PER_DEG_LAT * Math.cos(from.lat * RAD));
}

/** The direction from one place to another, degrees clockwise from true north. Flat-earth arithmetic, like `moved`. */
function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const north = (to.lat - from.lat) * M_PER_DEG_LAT;
  const east = (to.lon - from.lon) * M_PER_DEG_LAT * Math.cos(from.lat * RAD);
  return ((Math.atan2(east, north) / RAD) + 360) % 360;
}

/**
 * How far above the Course Bundle's filled-in height the road is likely to be at `km`: nothing
 * where the height is measured, and over a filled-in stretch the rise of a parabola between the
 * grade the road arrives at and the grade it leaves at. Never less than nothing: into a dip and
 * out of it, the straight line is already the high one.
 */
function crestOverTheFillM(scene: RideScene, km: number): number {
  const span = scene.notMeasured.find((candidate) => km > candidate.km_start && km < candidate.km_end);
  if (!span) return 0;
  const along = (km - span.km_start) / (span.km_end - span.km_start);
  return 4 * crestM(scene.line, span) * along * (1 - along);
}

/** How far over the straight fill a road's curve crests at the middle of a filled-in stretch. Worked out once for each: the camera asks on every frame. */
const CRESTS = new WeakMap<NotMeasuredSpan, number>();

function crestM(line: CourseLine, span: NotMeasuredSpan): number {
  let crest = CRESTS.get(span);
  if (crest === undefined) {
    const gradeIn = meanGrade(line, span.km_start - GRADE_READ_KM.to, span.km_start - GRADE_READ_KM.from);
    const gradeOut = meanGrade(line, span.km_end + GRADE_READ_KM.from, span.km_end + GRADE_READ_KM.to);
    // A stretch that runs to an end of the course has no grade to read on that side: no estimate.
    crest = gradeIn === null || gradeOut === null ? 0 : Math.max(((gradeIn - gradeOut) * (span.km_end - span.km_start) * 1000) / 8, 0);
    CRESTS.set(span, crest);
  }
  return crest;
}

/** The mean grade of the course line's samples between two places; null where there are none. */
function meanGrade(line: CourseLine, fromKm: number, toKm: number): number | null {
  let sum = 0;
  let count = 0;
  line.km.forEach((km, i) => {
    if (km < fromKm || km > toKm) return;
    sum += line.grade[i];
    count += 1;
  });
  return count > 0 ? sum / count : null;
}
