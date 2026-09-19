// The Ride's camera in the 3D scene (issue #8). Where it should be is worked out in
// core/ride-view.ts from the course line alone; this file only takes CesiumJS's camera there.
//
// From the moment the Ride takes the camera until free look or the map's own buttons take it, the
// camera is the Ride's, and it is put where the Ride wants it before every frame, playing or paused:
//  - the view is asked for afresh each frame, so the road's height under it follows our terrain as
//    finer tiles arrive, and the imagery as it comes and goes, with nobody having to say so;
//  - and whatever else moves the camera in between is undone before anyone sees it. CesiumJS
//    lifts a camera it finds under a surface it may collide with, which in photoreal is the top of
//    whatever stands over the road (a tree, the Queensboro's upper deck): left to it, a Ride paused
//    On the road would pop up onto the bridge. The Ride's height comes from our own data (PLAN.md D5).
// The Ride says whether it simply rode on, in which case the camera is put there, or is somewhere
// else (its start, Back, the other camera, a scrub, Play after the runner looked around), in which
// case the camera gets there in a moment's glide rather than a cut; with reduced motion asked
// for, it is a cut. Leaving the Ride gives the map back: `letGo`.
//
// The other way the camera follows the runner is free look (`lookAround`, issue #28, PLAN.md D54):
// a hand on the map turns the camera round the runner while the Ride plays on. There the camera is
// tied to a frame of reference that sits on the runner (east, north, up), and before every frame
// the frame is moved to where the runner now is while the camera keeps its place within it. That
// is what CesiumJS does for a tracked entity, and its own mouse controls, finding a camera tied to
// a frame, orbit the frame's origin rather than the globe: there is no control code of ours. What
// is ours is where the runner is (never read from photoreal imagery, PLAN.md D5), how far the
// camera may be taken from them, and setting the frame back the moment the camera is anyone
// else's, without which every flight and every view of the map afterwards is counted from the
// runner instead of from the world.
//
// Nothing here waits for a tile. On the keyless map the road's height is asked of our own open
// terrain, and where that has no answer the Course Bundle's own height is used. Photoreal imagery
// is never asked anything.
import { Cartesian3, Cartographic, type Event, Math as CesiumMath, Matrix4, Transforms } from "cesium";
import { relativeBearing } from "../core/bearing";
import type { HowItMoved } from "../core/ride";
import type { HeightAt, RideView, ScenePlace } from "../core/ride-view";

/** As much of the CesiumJS viewer as the Ride's camera touches. */
export interface SceneForRide {
  camera: {
    readonly positionCartographic: Cartographic;
    /** Where the camera is within the frame it is tied to: metres east, north and up of the runner while free look has it, and where it is in the world otherwise. */
    readonly position: Cartesian3;
    readonly heading: number;
    readonly pitch: number;
    setView(options: { destination: Cartesian3; orientation: { heading: number; pitch: number; roll: number } }): void;
    cancelFlight(): void;
    /**
     * Tie the camera to a frame of reference, or, with `Matrix4.IDENTITY`, set it back to the
     * world. Given an offset the camera is put there within the frame, looking at its origin;
     * given none it stays exactly where it is, and its place is counted within the frame from now on.
     */
    lookAtTransform(transform: Matrix4, offset?: Cartesian3): void;
  };
  scene: { preRender: Event };
}

export interface RideCameraOptions {
  /** Asked at every view: a runner can ask their system for reduced motion while the app is open. */
  reducedMotion(): boolean;
  /** The time in milliseconds. */
  now(): number;
}

export interface CameraInTheScene {
  /**
   * Hold the camera on the Ride. `view` is asked again before every frame until the next `follow`,
   * `lookAround` or `letGo`. `how` is what the Ride just did: "riding", it moved on and the camera
   * is put there; "jump", it is somewhere else and the camera glides there (or cuts, with reduced
   * motion). Coming out of free look it is a jump, so the camera glides back.
   */
  follow(view: () => RideView, how: HowItMoved): void;
  /**
   * Free look: the camera is the runner's to turn from now on, tied to wherever `runner` says they
   * are, which is asked again before every frame. A drag orbits them, a scroll moves in and out,
   * and the Ride plays on. Called again while it is already on, it only takes the new runner.
   */
  lookAround(runner: () => ScenePlace): void;
  /** The Ride is over, or the map is someone else's to fly: the camera is untied and left where it is, even in the middle of a glide. */
  letGo(): void;
}

/** How long a glide takes: the map's own flights take the same (main.ts). */
const GLIDE_SECONDS = 0.8;
/** A long glide rises in the middle, by this much of the ground it covers, so that between two places at road height it goes over the city and not through it. */
const RISE_PER_M = 0.25;
const MOST_RISE_M = 1200;
/** Closer to the view than this, in metres and in degrees, the camera is there already: nothing to glide. */
const THERE = { meters: 1, degrees: 1 };

/**
 * Free look's bounds. CesiumJS's controls orbit the frame's origin and stop at nothing: dragged
 * far enough the camera goes under the road, or out over the next county with the runner a speck.
 * So the camera is kept between these: `lowestDeg` above the runner's own level (On the road's
 * camera, 3 m up and 25 m behind, sits at about 7°, so the bound is under every view the Ride
 * hands over), `highestDeg` short of straight down, where which way round the camera is stops
 * meaning anything, and between `nearestM` and `farthestM` of them. Only what is outside is moved:
 * the view the runner turned to is theirs.
 *
 * The angle is measured at the runner's own level, so it keeps the camera out of the road *there*;
 * what keeps it out of a hillside between the two is CesiumJS's own collision, which free look
 * leaves alone, since in free look the camera's place is whatever those controls left (which is
 * also why free look over photoreal is unknown until the owner's key shows it: D54).
 *
 * `centringSeconds` is what the one turn of free look's own takes: From above holds the runner off
 * the middle of the map (the readout block covers its left, core/framing.ts) and free look orbits
 * them, so entering it carries them to the middle over that half second instead of snapping.
 */
export const FREE_LOOK = { nearestM: 15, farthestM: 6000, lowestDeg: 5, highestDeg: 85, centringSeconds: 0.5 };

/** The camera tied to the runner: free look. */
interface Tied {
  runner: () => ScenePlace;
  /** Where the camera was looking when free look began, metres east and north of the runner: what the one turn of its own brings to the middle. */
  offCentre: Cartesian3;
  startedMs: number;
  /** How much of `offCentre` the frame the camera was tied to last frame carried: 0 as free look begins (the frame was put on the runner), then the turn's own share of it. */
  carriedLastFrame: number;
}

export function createRideCamera(viewer: SceneForRide, options: RideCameraOptions): CameraInTheScene {
  const { camera } = viewer;
  /** Where the Ride wants the camera, asked each frame; null while the camera is the runner's or anyone else's. */
  let wanted: (() => RideView) | null = null;
  let glide: { from: RideView; startedMs: number; riseM: number } | null = null;
  /** The runner the camera is tied to while free look has it; null otherwise. */
  let tied: Tied | null = null;

  viewer.scene.preRender.addEventListener(() => {
    if (tied) return holdOnTheRunner(tied);
    if (!wanted) return;
    const view = wanted();
    if (!glide) return put(view);
    const t = Math.min((options.now() - glide.startedMs) / (GLIDE_SECONDS * 1000), 1);
    // Quick away and soft to land: dragging the strip starts a new glide with every move of the
    // pointer, and one that was slow to start would never get going.
    put(between(glide.from, view, 1 - (1 - t) ** 3, glide.riseM));
    if (t >= 1) glide = null;
  });

  /**
   * Free look, before a frame: the frame of reference is put where the runner now is, and the
   * camera keeps the place it holds from the runner, bounded, looking at the frame's origin.
   *
   * Which is the runner, once the one turn of free look's own is done. Until then the origin sits
   * a little off them, where the camera was looking when free look began, and closes that gap: the
   * camera doesn't move at all through it, it turns. What the runner's hand left the camera at is
   * read within the frame of the frame before, so a hand on the map in the middle of that turn is
   * still their own drag and nothing else.
   */
  function holdOnTheRunner(tie: Tied): void {
    const along = options.reducedMotion() ? 1 : Math.min((options.now() - tie.startedMs) / (FREE_LOOK.centringSeconds * 1000), 1);
    const toCome = 1 - along * along * (3 - 2 * along); // how much of the turn is still to come: even at both ends, so neither end of it is a jolt
    // Where the camera stands from the runner: the place the hand left it at, which is counted
    // within last frame's own frame, and that frame's origin was this much off the runner.
    const fromRunner = keptNearTheRunner(Cartesian3.add(camera.position, Cartesian3.multiplyByScalar(tie.offCentre, tie.carriedLastFrame, new Cartesian3()), new Cartesian3()));
    const offCentre = Cartesian3.multiplyByScalar(tie.offCentre, toCome, new Cartesian3());
    const frame = Matrix4.multiplyByTranslation(frameOn(tie.runner()), offCentre, new Matrix4());
    tie.carriedLastFrame = toCome;
    camera.lookAtTransform(frame, Cartesian3.subtract(fromRunner, offCentre, fromRunner));
  }

  /** Untie the camera from the runner: it stays exactly where it is, in the world. */
  function untie(): void {
    if (!tied) return;
    tied = null;
    camera.lookAtTransform(Matrix4.IDENTITY);
  }

  function put(view: RideView): void {
    camera.setView({
      destination: Cartesian3.fromDegrees(view.eye.lon, view.eye.lat, view.eye.heightM),
      orientation: { heading: CesiumMath.toRadians(view.headingDeg), pitch: CesiumMath.toRadians(view.pitchDeg), roll: 0 },
    });
  }

  return {
    follow(view, how) {
      untie(); // a glide is a move through the world, and so is every view the Ride asks for
      wanted = view;
      if (options.reducedMotion()) glide = null;
      else if (how === "jump") {
        const from = whereItIs(camera);
        const to = view();
        // A Ride that simply moves on while a glide is under way doesn't start another: the glide
        // ends on wherever the Ride has got to. A jump does, from wherever the camera has got to.
        glide = isThere(from, to) ? null : { from, startedMs: options.now(), riseM: Math.min(groundBetweenM(from, to) * RISE_PER_M, MOST_RISE_M) };
        if (glide) camera.cancelFlight();
      }
    },
    lookAround(runner) {
      if (tied) {
        tied.runner = runner; // dragged again, or a new course: the camera is already theirs
        return;
      }
      wanted = null;
      glide = null;
      camera.cancelFlight();
      // With no offset the camera stays exactly where it is in the world, and its place is counted
      // within the frame from now on: which is what `whereItIsLooking` then reads.
      camera.lookAtTransform(frameOn(runner()));
      tied = { runner, offCentre: whereItIsLooking(camera), startedMs: options.now(), carriedLastFrame: 0 };
    },
    letGo() {
      untie();
      wanted = null;
      glide = null;
    },
  };
}

/** The frame of reference that sits on a place: east, north and up, in metres, from there. */
function frameOn(at: ScenePlace): Matrix4 {
  return Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(at.lon, at.lat, at.heightM));
}

/**
 * Where a camera that has just been tied to a frame is looking, as metres east and north of the
 * frame's origin: where its view meets the level of the origin. Nothing where it looks level or
 * up, or where it stands at the origin's own level; and never further off than half the ground
 * between them, past which the view may as well simply centre what it is tied to.
 */
function whereItIsLooking(camera: SceneForRide["camera"]): Cartesian3 {
  const at = camera.position;
  const down = -camera.pitch;
  if (down <= 0 || at.z <= 0) return new Cartesian3();
  const alongM = at.z / Math.tan(down);
  const off = new Cartesian3(at.x + alongM * Math.sin(camera.heading), at.y + alongM * Math.cos(camera.heading), 0);
  const offM = Math.hypot(off.x, off.y);
  const mostM = Math.hypot(at.x, at.y) / 2;
  return offM > mostM ? Cartesian3.multiplyByScalar(off, mostM / offM, off) : off;
}

/**
 * A place within the runner's frame, kept where the runner can still be seen (`FREE_LOOK`): out of
 * the road, off the runner's own head, and near enough that they are not a speck. What is already
 * within the bounds is kept exactly as it is, so that the camera doesn't creep frame by frame.
 * Always a place of its own: CesiumJS moves the camera's own place into the new frame before it
 * reads the one it is given, so handing it back its own would leave it behind the runner.
 */
function keptNearTheRunner(at: Cartesian3): Cartesian3 {
  const awayM = Cartesian3.magnitude(at);
  const flatM = Math.hypot(at.x, at.y);
  const lowest = CesiumMath.toRadians(FREE_LOOK.lowestDeg);
  const highest = CesiumMath.toRadians(FREE_LOOK.highestDeg);
  const climbed = awayM === 0 ? lowest : Math.asin(at.z / awayM);
  if (awayM >= FREE_LOOK.nearestM && awayM <= FREE_LOOK.farthestM && climbed >= lowest && climbed <= highest) return Cartesian3.clone(at, new Cartesian3());
  // Which way round the runner the camera is, is the runner's own: only how far off and how high are bounded.
  const round = flatM === 0 ? Math.PI : Math.atan2(at.x, at.y); // straight over the runner, it comes down to the south, where From above stands
  const away = CesiumMath.clamp(awayM, FREE_LOOK.nearestM, FREE_LOOK.farthestM);
  const up = CesiumMath.clamp(climbed, lowest, highest);
  return new Cartesian3(away * Math.cos(up) * Math.sin(round), away * Math.cos(up) * Math.cos(round), away * Math.sin(up));
}

function whereItIs(camera: SceneForRide["camera"]): RideView {
  const at = camera.positionCartographic;
  return {
    eye: { lat: CesiumMath.toDegrees(at.latitude), lon: CesiumMath.toDegrees(at.longitude), heightM: at.height },
    headingDeg: CesiumMath.toDegrees(camera.heading),
    pitchDeg: CesiumMath.toDegrees(camera.pitch),
  };
}

/** Whether a camera at `from` is, to the eye, already at `to`: the place, and the way it faces. */
function isThere(from: RideView, to: RideView): boolean {
  const apartM = Cartesian3.distance(Cartesian3.fromDegrees(from.eye.lon, from.eye.lat, from.eye.heightM), Cartesian3.fromDegrees(to.eye.lon, to.eye.lat, to.eye.heightM));
  return apartM < THERE.meters && Math.abs(relativeBearing(from.headingDeg, to.headingDeg)) < THERE.degrees && Math.abs(from.pitchDeg - to.pitchDeg) < THERE.degrees;
}

/** How much ground lies between two views, whatever their heights. */
function groundBetweenM(a: RideView, b: RideView): number {
  return Cartesian3.distance(Cartesian3.fromDegrees(a.eye.lon, a.eye.lat, 0), Cartesian3.fromDegrees(b.eye.lon, b.eye.lat, 0));
}

/** The view `t` of the way from one to another (0 to 1), turning the short way round, and `riseM` higher in the middle. */
function between(from: RideView, to: RideView, t: number, riseM: number): RideView {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    eye: { lat: mix(from.eye.lat, to.eye.lat), lon: mix(from.eye.lon, to.eye.lon), heightM: mix(from.eye.heightM, to.eye.heightM) + riseM * Math.sin(Math.PI * t) },
    headingDeg: from.headingDeg + relativeBearing(from.headingDeg, to.headingDeg) * t,
    pitchDeg: mix(from.pitchDeg, to.pitchDeg),
  };
}

/**
 * The road's height on the keyless map, where the course is draped on our own open terrain: the
 * terrain's height there, as far as it has loaded. Where it has no answer (not loaded yet, or
 * its tiles failed) the Course Bundle's own height stands in, so the Ride never waits for a tile.
 */
export function roadHeightOnTheMap(globe: { getHeight(place: Cartographic): number | undefined }): HeightAt {
  const place = new Cartographic();
  return (at) => {
    const terrainM = globe.getHeight(Cartographic.fromDegrees(at.lon, at.lat, 0, place));
    return terrainM !== undefined && Number.isFinite(terrainM) ? terrainM : at.ellipsoidHeightM;
  };
}
