// The 3D globe: keyless basemap and terrain, the camera, and the scene's clock. The course is
// drawn by course-line.ts, and the runner is laid over the map by map-dots.ts.
//
// The scene has no clock of its own. Cesium's clock is stopped and set from the Planner's race
// clock every time the runner moves, so Cesium's sun is where the sun will be when the runner
// gets there, and never drifts from the readout.
import {
  BoundingSphere,
  Cartesian3,
  Cartesian4,
  Cartographic,
  CesiumTerrainProvider,
  Color,
  Credit,
  HeadingPitchRange,
  ImageryLayer,
  Ion,
  JulianDate,
  Math as CesiumMath,
  Matrix4,
  OpenStreetMapImageryProvider,
  PerspectiveFrustum,
  sampleTerrainMostDetailed,
  Terrain,
  Transforms,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CourseLine } from "../bundle/types";
import { rangeToFitM, sidewaysShiftM } from "../core/framing";
import type { RoadPosition } from "../core/scrub";
import { registerCourseRibbon } from "./course-ribbon";
import { groundUnderM } from "./ground-under";
import { middleOfTheMap } from "./map-middle";
import { plainGroundIfTerrainFails } from "./plain-ground";
import { BASEMAP, TERRAIN } from "./providers";

const EARTH_RADIUS_M = 6_371_000;
/** How far down the camera looks when it frames the course: from above, tilted enough that the city reads as 3D. */
const CAMERA_TILT_RAD = CesiumMath.toRadians(60);

/** Where the camera was left by the last framing of the whole course, to tell whether the runner has moved the map since. */
const framedFrom = new WeakMap<Viewer, Cartesian3>();

/** The viewer is made once; switching course only swaps what is drawn on it. */
export function createGlobe(container: HTMLElement): Viewer {
  // CesiumJS comes with a demo Cesium ion token of its own, for trying ion out. This app is keyless
  // until a runner brings their own key (PLAN.md D3), so the demo token is switched off: nothing
  // here can reach ion by accident, and a runner's token is only ever handed over explicitly.
  Ion.defaultAccessToken = "";
  registerCourseRibbon();

  const terrain = new Terrain(CesiumTerrainProvider.fromUrl(TERRAIN.url));
  const viewer = new Viewer(container, {
    baseLayer: new ImageryLayer(
      new OpenStreetMapImageryProvider({
        url: BASEMAP.url,
        maximumLevel: BASEMAP.maximumLevel,
        credit: new Credit(BASEMAP.creditHtml, true),
      }),
    ),
    terrain,
    // Everything below would otherwise reach for Cesium ion (which needs a key) or add clutter.
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  plainGroundIfTerrainFails(terrain, viewer.scene.globe);

  // Light the ground from wherever the sun is at the scene's clock, which the race clock sets.
  // Cesium normally fades this lighting out once the camera is within ~10,000 km of the ground,
  // so that a city never looks dark; but a city at race time is exactly what this app shows. With
  // the fade pulled in to nothing, a low sun dims the map and a set sun leaves it at the globe's
  // night-side floor (30% by default): dark enough to notice, light enough to read.
  const globe = viewer.scene.globe;
  globe.enableLighting = true;
  globe.lightingFadeOutDistance = 0;
  globe.lightingFadeInDistance = 1;
  viewer.clock.shouldAnimate = false; // time moves only when the runner does

  return viewer;
}

/** Set the scene's clock to the moment the runner is where they are: the scene's sun is that moment's sun (PLAN.md D39). */
export function showMoment(viewer: Viewer, instant: Date): void {
  viewer.clock.currentTime = JulianDate.fromDate(instant);
}

/**
 * Look at the whole course from above and a little to the south. `coveredLeftPx` is how
 * much of the map's left side is under the readout block: the course is put in the middle of the
 * part that is clear. `seconds` of flight; 0 jumps, which is what reduced motion gets.
 */
export function frameCourse(viewer: Viewer, line: CourseLine, coveredLeftPx: number, seconds = 0): void {
  const sphere = BoundingSphere.fromPoints(line.lat.map((lat, i) => Cartesian3.fromDegrees(line.lon[i], lat)));
  const view = { fovRad: horizontalFov(viewer), viewWidthPx: viewer.canvas.clientWidth, viewHeightPx: viewer.canvas.clientHeight, coveredLeftPx };
  const rangeM = rangeToFitM({ ...view, radiusM: sphere.radius, tiltRad: CAMERA_TILT_RAD });
  // The camera faces north, so the course's left is west: aim that far west of its middle, and the
  // course lands in the clear part of the map. Aimed there from the start, a flight ends where it
  // should, with no jump sideways at the end.
  const east = Matrix4.getColumn(Transforms.eastNorthUpToFixedFrame(sphere.center), 0, new Cartesian4());
  const west = Cartesian3.multiplyByScalar(new Cartesian3(east.x, east.y, east.z), -sidewaysShiftM({ ...view, rangeM }), new Cartesian3());
  viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.add(sphere.center, west, new Cartesian3()), sphere.radius), {
    offset: new HeadingPitchRange(0, -CAMERA_TILT_RAD, rangeM),
    duration: seconds,
    complete: () => framedFrom.set(viewer, Cartesian3.clone(viewer.camera.positionWC)),
  });
}

/**
 * Whether the map is still as the last framing of the whole course left it. If it is, a change in
 * the map's size (the strip opening) can frame the course again; if the runner has moved the map,
 * it is theirs, and is left alone.
 */
export function isStillFramed(viewer: Viewer): boolean {
  const from = framedFrom.get(viewer);
  return from !== undefined && Cartesian3.equalsEpsilon(from, viewer.camera.positionWC, 0, 0.5);
}

/**
 * How far to the left of something the camera has to be, as a fraction of its distance from it,
 * for that thing to be in the middle of the part of the map that `coveredLeftPx` leaves clear. The
 * Ride's From above camera keeps the runner there, as the framing of the whole course does the course.
 */
export function leftOfMiddle(viewer: Viewer, coveredLeftPx: number): number {
  return sidewaysShiftM({ fovRad: horizontalFov(viewer), viewWidthPx: viewer.canvas.clientWidth, viewHeightPx: viewer.canvas.clientHeight, coveredLeftPx, rangeM: 1 });
}

function horizontalFov(viewer: Viewer): number {
  const frustum = viewer.camera.frustum;
  if (!(frustum instanceof PerspectiveFrustum) || frustum.fov === undefined) return CesiumMath.toRadians(60);
  // CesiumJS's `fov` is across the longer side of the view.
  const aspect = frustum.aspectRatio ?? 1;
  return aspect >= 1 ? frustum.fov : 2 * Math.atan(Math.tan(frustum.fov / 2) * aspect);
}

/** Bring a place on the course to the middle of the map, from the height the camera is already at. */
export function goTo(viewer: Viewer, place: RoadPosition, seconds = 0): void {
  const rangeM = Math.max(heightAboveGround(viewer) / Math.sin(CAMERA_TILT_RAD), 300);
  viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(place.lon, place.lat), 1), {
    offset: new HeadingPitchRange(viewer.camera.heading, -CAMERA_TILT_RAD, rangeM),
    duration: seconds,
  });
}

/** Steeper than this and the camera counts as looking straight down. */
const STRAIGHT_DOWN_RAD = CesiumMath.toRadians(80);

export function isLookingStraightDown(viewer: Viewer): boolean {
  return -viewer.camera.pitch > STRAIGHT_DOWN_RAD;
}

/**
 * Look at the same place from straight above, north up, like a paper map; or, if the camera is
 * already there, tip back to the tilted view. What is in the middle of the map stays in the middle,
 * at the same distance, so it is a way back from road height as well as a way to read the course
 * like a map.
 */
export function toggleStraightDown(viewer: Viewer, seconds = 0): void {
  // On the ground under the camera, not on the ellipsoid, which a camera over a New York street is inside of (map-middle.ts).
  const middle = middleOfTheMap(viewer.camera, viewer.canvas, viewer.camera.positionCartographic.height - heightAboveGround(viewer));
  if (!middle) return;
  const rangeM = Math.max(Cartesian3.distance(viewer.camera.positionWC, middle), 300);
  const tiltRad = isLookingStraightDown(viewer) ? CAMERA_TILT_RAD : CesiumMath.PI_OVER_TWO;
  viewer.camera.flyToBoundingSphere(new BoundingSphere(middle, 1), { offset: new HeadingPitchRange(0, -tiltRad, rangeM), duration: seconds });
}

/**
 * In the dark theme the keyless map goes quiet: dimmer and almost without colour, so a bright map
 * doesn't glare out of a dark screen and the blue line is the brightest thing on it. Only our own
 * basemap layer is touched. Photoreal imagery is Google's and is shown as it comes.
 */
export function showMapTheme(viewer: Viewer, theme: "light" | "dark"): void {
  // The ground under the basemap: what is on screen where a map tile hasn't arrived, or can't
  // (PLAN.md D16: the map service is best-effort). A quiet grey the course's blue reads on, in
  // place of CesiumJS's deep blue, which is the course's own colour.
  viewer.scene.globe.baseColor = Color.fromCssColorString(theme === "dark" ? "#33332f" : "#deded8");
  const basemap = viewer.imageryLayers.get(0);
  if (!basemap) return;
  basemap.brightness = theme === "dark" ? 0.55 : 1;
  basemap.contrast = theme === "dark" ? 1.15 : 1;
  basemap.saturation = theme === "dark" ? 0.15 : 1;
}

/** For each map, how high the road is where the runner is, from the Course Bundle: the ground while photoreal has hidden the globe (ground-under.ts). */
const roadWhenHidden = new WeakMap<Viewer, () => number | undefined>();

/** Say where to ask for the road's own height. Asked only while the plain ground is hidden, each time it is needed. */
export function useRoadAsGroundWhenHidden(viewer: Viewer, roadM: () => number | undefined): void {
  roadWhenHidden.set(viewer, roadM);
}

/** How far the camera is above the ground under it (never less than a metre, so the ground is always under the camera). */
function heightAboveGround(viewer: Viewer): number {
  const eye = viewer.camera.positionCartographic;
  return Math.max(eye.height - groundUnderM(viewer.scene.globe, eye, roadWhenHidden.get(viewer)), 1);
}

/** Move the map a quarter of a screen: `right` and `up` are -1, 0 or 1, as on the arrow keys. */
export function panMap(viewer: Viewer, right: number, up: number): void {
  const camera = viewer.camera;
  const height = heightAboveGround(viewer);
  if (height > 1_000_000) {
    // From this far out the ground curves away: go round the globe instead of along a tangent.
    const angle = (height * 0.2) / EARTH_RADIUS_M;
    if (right !== 0) camera.rotateRight(-right * angle);
    if (up !== 0) camera.rotateUp(-up * angle);
    return;
  }
  // Along the ground, not along the tilted camera: sideways, and towards the top of the screen.
  const skyward = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(camera.positionWC, new Cartesian3());
  const ahead = Cartesian3.normalize(Cartesian3.cross(skyward, camera.rightWC, new Cartesian3()), new Cartesian3());
  const step = Math.max(height * 0.3, 20);
  camera.move(camera.rightWC, right * step);
  camera.move(ahead, up * step);
}

/** Zoom the map in (`towards` = 1) or out (-1), never through the ground. */
export function zoomMap(viewer: Viewer, towards: number): void {
  const height = heightAboveGround(viewer);
  if (towards > 0 && height > 80) viewer.camera.zoomIn(height * 0.4);
  if (towards < 0 && height < 20_000_000) viewer.camera.zoomOut(height * 0.7);
}

/**
 * Tell `onHeight` how far the camera is above the ground, now and each time the camera comes to
 * rest, until the function this returns is called. The ground is the keyless open terrain, never
 * the photoreal imagery, which is for looking at only (PLAN.md D5). That terrain is good to a few
 * metres, so near the ground the answer is rough. Null when the terrain can't say.
 */
export function watchCameraHeight(viewer: Viewer, onHeight: (meters: number | null) => void): () => void {
  let asked = 0;
  const measure = async (): Promise<void> => {
    const mine = ++asked;
    const eye = Cartographic.clone(viewer.camera.positionCartographic);
    let meters: number | null = null;
    try {
      const [ground] = await sampleTerrainMostDetailed(viewer.terrainProvider, [Cartographic.clone(eye)]);
      if (Number.isFinite(ground.height)) meters = eye.height - ground.height;
    } catch {
      // The terrain is best-effort (PLAN.md D16). No height is better than a wrong one.
    }
    if (mine === asked) onHeight(meters);
  };
  // CesiumJS says the camera has come to rest before the frame is drawn, and before the Ride, if it
  // is holding the camera, has put it where that frame is drawn from (scene/ride-camera.ts): read
  // then, it is the camera CesiumJS nudged, a view nobody sees. It is read once that frame is drawn.
  let waitingForTheFrame: (() => void) | undefined;
  const stopListening = viewer.camera.moveEnd.addEventListener(() => {
    waitingForTheFrame ??= viewer.scene.postRender.addEventListener(() => {
      waitingForTheFrame?.();
      waitingForTheFrame = undefined;
      void measure();
    });
  });
  void measure();
  return () => {
    asked += 1; // an answer still on its way is no longer wanted
    stopListening();
    waitingForTheFrame?.();
  };
}
