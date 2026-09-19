// The Ride's camera in the 3D scene (issue #8). Where it should be is worked out in
// core/ride-view.ts from the course line alone; this file only takes CesiumJS's camera there.
//
// From the moment the Ride takes the camera until the runner takes the map, the camera is the
// Ride's, and it is put where the Ride wants it before every frame is drawn, playing or paused:
//  - the view is asked for afresh each frame, so the road's height under it follows our terrain as
//    finer tiles arrive, and the imagery as it comes and goes, with nobody having to say so;
//  - and whatever else moves the camera in between is undone before anyone sees it. CesiumJS
//    lifts a camera it finds under a surface it may collide with, which in photoreal is the top of
//    whatever stands over the road (a tree, the Queensboro's upper deck): left to it, a Ride paused
//    On the road would pop up onto the bridge. The Ride's height comes from our own data (PLAN.md D5).
// The Ride says whether it simply rode on, in which case the camera is put there, or is somewhere
// else (its start, Back, the other camera, a scrub, Play after the runner looked around), in which
// case the camera gets there in a moment's glide rather than a cut; with reduced motion asked
// for, it is a cut. Paused, the map is the runner's the instant they touch it: `letGo`.
//
// Nothing here waits for a tile. On the keyless map the road's height is asked of our own open
// terrain, and where that has no answer the Course Bundle's own height is used. Photoreal imagery
// is never asked anything.
import { Cartesian3, Cartographic, type Event, Math as CesiumMath } from "cesium";
import { relativeBearing } from "../core/bearing";
import type { HeightAt, RideView } from "../core/ride-view";

/** As much of the CesiumJS viewer as the Ride's camera touches. */
export interface SceneForRide {
  camera: {
    readonly positionCartographic: Cartographic;
    readonly heading: number;
    readonly pitch: number;
    setView(options: { destination: Cartesian3; orientation: { heading: number; pitch: number; roll: number } }): void;
    cancelFlight(): void;
  };
  scene: { preRender: Event };
}

export interface RideCameraOptions {
  /** Asked at every view: a runner can ask their system for reduced motion while the app is open. */
  reducedMotion(): boolean;
  /** The time in milliseconds. */
  now(): number;
}

export interface RideCamera {
  /**
   * Hold the camera on the Ride. `view` is asked again before every frame until the next `follow`
   * or `letGo`. `how` is what the Ride just did: "riding", it moved on and the camera is put there;
   * "jump", it is somewhere else and the camera glides there (or cuts, with reduced motion).
   */
  follow(view: () => RideView, how: "riding" | "jump"): void;
  /** The runner has taken hold of the map, or the Ride is over: the camera is theirs from this moment, even in the middle of a glide. */
  letGo(): void;
}

/** How long a glide takes: the map's own flights take the same (main.ts). */
const GLIDE_SECONDS = 0.8;
/** A long glide rises in the middle, by this much of the ground it covers, so that between two places at road height it goes over the city and not through it. */
const RISE_PER_M = 0.25;
const MOST_RISE_M = 1200;
/** Closer to the view than this, in metres and in degrees, the camera is there already: nothing to glide. */
const THERE = { meters: 1, degrees: 1 };

export function createRideCamera(viewer: SceneForRide, options: RideCameraOptions): RideCamera {
  const { camera } = viewer;
  /** Where the Ride wants the camera, asked each frame; null while the camera is the runner's. */
  let wanted: (() => RideView) | null = null;
  let glide: { from: RideView; startedMs: number; riseM: number } | null = null;

  viewer.scene.preRender.addEventListener(() => {
    if (!wanted) return;
    const view = wanted();
    if (!glide) return put(view);
    const t = Math.min((options.now() - glide.startedMs) / (GLIDE_SECONDS * 1000), 1);
    // Quick away and soft to land: dragging the strip starts a new glide with every move of the
    // pointer, and one that was slow to start would never get going.
    put(between(glide.from, view, 1 - (1 - t) ** 3, glide.riseM));
    if (t >= 1) glide = null;
  });

  function put(view: RideView): void {
    camera.setView({
      destination: Cartesian3.fromDegrees(view.eye.lon, view.eye.lat, view.eye.heightM),
      orientation: { heading: CesiumMath.toRadians(view.headingDeg), pitch: CesiumMath.toRadians(view.pitchDeg), roll: 0 },
    });
  }

  return {
    follow(view, how) {
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
    letGo() {
      wanted = null;
      glide = null;
    },
  };
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
