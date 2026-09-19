// The Ride's camera in the 3D scene (issue #8). Where it should be is worked out in
// core/ride-view.ts from the course line alone; this file only takes CesiumJS's camera there.
//
// While the Ride moves, the camera is put exactly where the view says, frame by frame. A view that
// is far from where the camera is (the start of the Ride, Back, a switch of cameras, the runner
// having looked around while paused) is reached in a moment's glide rather than a cut, except
// with reduced motion asked for, when it is a cut. Whenever the Ride isn't asking for a new view
// the camera is left alone, so paused, the map is the runner's to orbit, pan and zoom.
//
// Nothing here waits for a tile. On the keyless map the road's height is asked of our own open
// terrain, and where that has no answer yet (or never will: its tiles failed) the Course
// Bundle's own height is used. Photoreal imagery is never asked anything (PLAN.md D5).
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
  /** Take the camera to this view: at once if it is a frame's ride away, in a moment's glide if it is further. */
  show(view: RideView): void;
  /** The runner has taken hold of the map: the camera is theirs from this moment, even in the middle of a glide. */
  letGo(): void;
}

/** How long the glide to a far-off view takes: the map's own flights take the same (main.ts). */
const GLIDE_SECONDS = 0.8;
/** Further than a frame of the Ride can carry the camera (55 m, from above at the cruise): a view this far off is glided to. */
const FAR_OFF_M = 150;
/** A long glide rises in the middle, so that between two places at road height it goes over the city and not through it. */
const RISE_PER_M = 0.25;
const MOST_RISE_M = 1200;

export function createRideCamera(viewer: SceneForRide, options: RideCameraOptions): RideCamera {
  const { camera } = viewer;
  /** The view still to be shown; null once it has been, and the camera is the runner's again. */
  let wanted: RideView | null = null;
  /** The view last asked for, to tell a Ride moving on from a jump to somewhere else. */
  let lastAsked: RideView | null = null;
  let glide: { from: RideView; startedMs: number; riseM: number } | null = null;

  viewer.scene.preRender.addEventListener(() => {
    if (!wanted) return;
    if (!glide) {
      put(wanted);
      wanted = null; // until the Ride asks again, the camera is the runner's
      return;
    }
    const t = Math.min((options.now() - glide.startedMs) / (GLIDE_SECONDS * 1000), 1);
    // Quick away and soft to land: dragging the strip starts a new glide with every move of the
    // pointer, and one that was slow to start would never get going.
    const eased = 1 - (1 - t) ** 3;
    put(between(glide.from, wanted, eased, glide.riseM));
    if (t >= 1) {
      glide = null;
      wanted = null;
    }
  });

  function put(view: RideView): void {
    camera.setView({
      destination: Cartesian3.fromDegrees(view.eye.lon, view.eye.lat, view.eye.heightM),
      orientation: { heading: CesiumMath.toRadians(view.headingDeg), pitch: CesiumMath.toRadians(view.pitchDeg), roll: 0 },
    });
  }

  return {
    show(view) {
      const from = whereItIs(camera);
      const awayM = metersApart(from, view);
      // A new glide when the Ride has jumped somewhere else, or when the camera isn't where the Ride
      // left it (the runner looked around). A Ride that simply moves on while a glide is under way
      // doesn't start another: the glide ends on wherever the Ride has got to.
      const jumped = lastAsked !== null && metersApart(lastAsked, view) > FAR_OFF_M;
      if (options.reducedMotion()) glide = null;
      else if (jumped || (!glide && awayM > FAR_OFF_M)) {
        camera.cancelFlight();
        glide = { from, startedMs: options.now(), riseM: Math.min(awayM * RISE_PER_M, MOST_RISE_M) };
      }
      wanted = lastAsked = view;
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

function metersApart(a: RideView, b: RideView): number {
  return Cartesian3.distance(Cartesian3.fromDegrees(a.eye.lon, a.eye.lat, a.eye.heightM), Cartesian3.fromDegrees(b.eye.lon, b.eye.lat, b.eye.heightM));
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
