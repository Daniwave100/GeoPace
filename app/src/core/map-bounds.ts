// How far the map may be taken from the course: the vicinity (issue #25).
//
// The map is "moved freely like any maps app" (PLAN.md D34) — freely within one city. A runner who
// drags far enough has the course off screen and no idea how to get back; the keyless map's own
// terms ask that its tiles aren't fetched in bulk (PLAN.md §9), and an unbounded map invites
// exactly that; and the app is about one course, so wandering isn't a feature.
//
// ⛔ Not for the money, which is the reason the bound was asked for: Google's photoreal imagery is
// billed by the **load**, not by the tile or the mile (PLAN.md D44, measured while building #17),
// so panning to Spain and back costs nothing extra.
//
// Two bounds, both measured from the course itself, so they move with it when the runner switches
// course: how far the map may look from the course, and how far out it may be taken — and, within
// those, how far one press of the zoom buttons goes. Where they are put on the camera is
// scene/map-bounds.ts.
import type { CourseLine } from "../bundle/types";
import { CAMERA_TILT_RAD, type MapView, rangeToFitM } from "./framing";

/**
 * How far beyond the course's own box the map may look. About a city's width: far enough that the
 * city around the course is there for context (New York's course box is 11 by 24 km, Berlin's 10
 * by 7), tight enough that the next city is out of reach — Philadelphia is 130 km from New York,
 * Hamburg 250 km from Berlin. Dragged to the wall at a close zoom the course is off the map all
 * the same — 20 km of city is wider than any view of a street — and the way back is where it has
 * always been: "Whole course" and "Where I am". 🟡 Claude's number, one line to change.
 */
export const ROUND_THE_COURSE_M = 20_000;

/**
 * How far out the map may be taken, as a multiple of the height the camera stands at to show the
 * whole course in the map as it is shaped now: the course fills the map at one, and the city round
 * it at two — 87 km up for New York on an open laptop, 125 km with the strip open, 41 km for
 * Berlin. It is measured against the whole-course view rather than being one fixed height because
 * the map is often a letterbox — with the strip open the camera has to stand three times further
 * back to fit the course in — and a floor under that view would yank the camera in the moment a
 * runner asked for less. 🟡 Claude's number, one line to change: what it is *not* measured against
 * is the vicinity, which is grown by a fixed 20 km whatever the course's own size, so how much of
 * the vicinity is in view out there is not the same on both courses (New York's view is twice its
 * vicinity's width, Berlin's four fifths of it).
 */
export const AS_FAR_OUT_AS = 2;

/** How far the map may be taken from one course: degrees, and the course's own size. */
export interface Vicinity {
  west: number;
  south: number;
  east: number;
  north: number;
  /**
   * How big the course is: half the diagonal of its own box, metres. The zoom floor is measured
   * from it, and must never come in under the whole-course view itself, which `frameCourse` sizes
   * from the sphere it fits the course into instead (13.0 km against 12.9 in New York, 6.1 against
   * 5.5 in Berlin — bigger here, which is the safe side, though only for these two courses: what
   * holds the floor above the view for certain is `AS_FAR_OUT_AS`, and a test measures both).
   */
  courseRadiusM: number;
}

const M_PER_DEG_LAT = 111_320;
const RAD = Math.PI / 180;

/** The vicinity of a course: its own box, grown by `roundTheCourseM` on every side. */
export function vicinityOf(line: CourseLine): Vicinity {
  const west = Math.min(...line.lon);
  const east = Math.max(...line.lon);
  const south = Math.min(...line.lat);
  const north = Math.max(...line.lat);
  const wideM = (east - west) * M_PER_DEG_LAT * Math.cos(((south + north) / 2) * RAD);
  const tallM = (north - south) * M_PER_DEG_LAT;
  return grownBy({ west, east, south, north, courseRadiusM: Math.hypot(wideM, tallM) / 2 }, ROUND_THE_COURSE_M);
}

/**
 * The place itself, if it is in the vicinity; otherwise the nearest place in it. Each way round is
 * bounded on its own, so a drag along an edge slides along it instead of sticking in a corner.
 */
export function keptInTheVicinity(vicinity: Vicinity, place: { lat: number; lon: number }): { lat: number; lon: number } {
  return {
    lat: Math.min(Math.max(place.lat, vicinity.south), vicinity.north),
    lon: Math.min(Math.max(place.lon, vicinity.west), vicinity.east),
  };
}

/** Whether a place is in the vicinity at all. */
export function isInTheVicinity(vicinity: Vicinity, place: { lat: number; lon: number }): boolean {
  const kept = keptInTheVicinity(vicinity, place);
  return kept.lat === place.lat && kept.lon === place.lon;
}

/** Where the camera is and which way it faces: as much as it takes to say what the map is looking at. */
export interface CameraOnTheMap {
  lat: number;
  lon: number;
  /** Metres above the ellipsoid. */
  heightM: number;
  /** Degrees clockwise from true north. */
  headingDeg: number;
  /** Degrees above the horizon: negative looks down. */
  pitchDeg: number;
}

/**
 * The place on the ground the map is looking at: the way the camera faces, as far ahead as its own
 * height and tilt put the ground in the middle of the view.
 *
 * Never further ahead than the framing's own tilt would look (`CAMERA_TILT_RAD`), and that cap is
 * what keeps a tilted view honest: a runner who tips the view towards the horizon (Ctrl + drag)
 * has the middle of the map a hundred kilometres off without having moved at all, and asked where
 * they were looking, the answer would be the next county. Tilted that way, or level, or above the
 * horizon, the map counts as looking just ahead of the camera, so tilting alone never moves it.
 */
export function whatTheMapLooksAt(camera: CameraOnTheMap): { lat: number; lon: number } {
  const downRad = Math.max(-camera.pitchDeg * RAD, CAMERA_TILT_RAD);
  const aheadM = Math.max(camera.heightM, 0) / Math.tan(downRad);
  return {
    lat: camera.lat + (aheadM * Math.cos(camera.headingDeg * RAD)) / M_PER_DEG_LAT,
    lon: camera.lon + (aheadM * Math.sin(camera.headingDeg * RAD)) / (M_PER_DEG_LAT * Math.cos(camera.lat * RAD)),
  };
}

/**
 * Where the camera may stand: where it is, if what the map is looking at is in the vicinity, and
 * otherwise moved by exactly as far as what it is looking at had gone too far.
 *
 * It is what the map *looks at* that the vicinity holds, not where the camera stands. The camera
 * has to stand well outside a city to show the whole of it — 25 km south of the middle of New York
 * from the 43 km up that takes, and 57 km south from the 99 km up it takes with the strip open —
 * so a wall round the camera would either fight "Whole course" or have to be set so far out that
 * it bounded nothing. A wall round what the map looks at does neither: every one of the map's own
 * views looks at the course itself, however far back it stands to see it.
 */
export function whereTheCameraMayStand(vicinity: Vicinity, camera: CameraOnTheMap): { lat: number; lon: number } {
  let at = { lat: camera.lat, lon: camera.lon };
  // Twice round. Brought back in latitude as well — a corner of the vicinity — the camera then
  // looks a slightly different number of degrees ahead of itself, because a degree of longitude is
  // a different length there, and from as far out as the map goes that is a few hundred metres
  // (New York, at the corner: 331 m). The second pass is what keeps such a camera from being left
  // looking outside the wall; left a few hundred metres inside it, it is where it may be already
  // and nothing moves it.
  for (let pass = 0; pass < 2; pass += 1) {
    const looksAt = whatTheMapLooksAt({ ...camera, ...at });
    const kept = keptInTheVicinity(vicinity, looksAt);
    at = { lat: at.lat + (kept.lat - looksAt.lat), lon: at.lon + (kept.lon - looksAt.lon) };
  }
  return at;
}

/**
 * How high the camera may be taken, metres above the ellipsoid: `asFarOutAs` times the height it
 * stands at to show the whole course in the map as it is shaped now. core/framing.ts works that
 * height out for the framing itself, and this asks it the same question, so the floor can never
 * come in under a "Whole course" view.
 */
export function farthestOutM(vicinity: Vicinity, view: MapView): number {
  return AS_FAR_OUT_AS * rangeToFitM({ ...view, radiusM: vicinity.courseRadiusM, tiltRad: CAMERA_TILT_RAD }) * Math.sin(CAMERA_TILT_RAD);
}

/** Nearer the ground than this, the zoom-in button stops, so a runner who holds it down ends up on the street and not inside it. */
const NEAREST_M = 80;
/** How much of the way to the ground one press of the zoom buttons goes, in and out. Out is the larger, so a press out undoes a press in. */
const STEP = { in: 0.4, out: 0.7 };

/**
 * How far one press of the zoom buttons moves the camera, metres, never negative: `towards` is 1
 * in and -1 out. Out, it stops dead at whatever room is left rather than overshooting it, and a
 * press with nowhere left to go moves nothing at all. The step itself is a share of how high the
 * camera is above the ground; the room is how much further out it may go, which the caller works
 * out the way the floor is measured (scene/globe.ts).
 */
export function zoomStepM(towards: number, aboveGroundM: number, roomToGoOutM: number): number {
  if (towards > 0) return aboveGroundM > NEAREST_M ? aboveGroundM * STEP.in : 0;
  return Math.max(Math.min(aboveGroundM * STEP.out, roomToGoOutM), 0);
}

/** The vicinity with `meters` more of it on every side. A degree of longitude is shorter the further from the equator: grown by the metres it takes at the edge nearer the pole, so it is at least that wide everywhere in it. */
function grownBy(vicinity: Vicinity, meters: number): Vicinity {
  const lat = meters / M_PER_DEG_LAT;
  const lon = lat / Math.cos(Math.max(Math.abs(vicinity.south), Math.abs(vicinity.north)) * RAD);
  return { ...vicinity, west: vicinity.west - lon, east: vicinity.east + lon, south: vicinity.south - lat, north: vicinity.north + lat };
}
