// The 3D globe: keyless basemap and terrain, with the course and the runner drawn on the ground.
//
// The scene has no clock of its own. Cesium's clock is stopped and set from the Planner's race
// clock every time the runner moves, so Cesium's sun is where the sun will be when the runner
// gets there, and never drifts from the readout.
import {
  BoundingSphere,
  Cartesian3,
  CesiumTerrainProvider,
  ClockRange,
  Color,
  ConstantPositionProperty,
  Credit,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  JulianDate,
  LabelStyle,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  Terrain,
  VerticalOrigin,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CourseBundle } from "../bundle/types";
import type { RoadPosition } from "../core/scrub";
import { BASEMAP, TERRAIN } from "./providers";

const RUNNER_ID = "runner";

/** The viewer is made once; switching course only swaps what is drawn on it. */
export function createGlobe(container: HTMLElement): Viewer {
  const viewer = new Viewer(container, {
    baseLayer: new ImageryLayer(
      new OpenStreetMapImageryProvider({
        url: BASEMAP.url,
        maximumLevel: BASEMAP.maximumLevel,
        credit: new Credit(BASEMAP.creditHtml, true),
      }),
    ),
    terrain: new Terrain(CesiumTerrainProvider.fromUrl(TERRAIN.url)),
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

/** The race as the scene's time span: the wave's start to this runner's finish. */
export function showRaceTimes(viewer: Viewer, start: Date, finish: Date): void {
  viewer.clock.startTime = JulianDate.fromDate(start);
  viewer.clock.stopTime = JulianDate.fromDate(finish);
  viewer.clock.clockRange = ClockRange.CLAMPED;
}

/** Put the runner at a place on the course at a moment: the marker and the sun move together. */
export function showRunner(viewer: Viewer, place: RoadPosition, instant: Date): void {
  const position = Cartesian3.fromDegrees(place.lon, place.lat);
  const runner = viewer.entities.getById(RUNNER_ID);
  if (runner) {
    runner.position = new ConstantPositionProperty(position);
  } else {
    viewer.entities.add({
      id: RUNNER_ID,
      name: "Runner",
      position,
      point: {
        pixelSize: 16,
        color: Color.fromCssColorString("#1546ff"),
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // never hidden behind a hill or a bridge
      },
    });
  }
  viewer.clock.currentTime = JulianDate.fromDate(instant);
}

/** Draw one course: the route on the ground, its start and finish, and fly to it. */
export function showCourse(viewer: Viewer, bundle: CourseBundle): void {
  const line = bundle.measured.course_line;
  viewer.entities.removeAll();
  const positions = Cartesian3.fromDegreesArray(line.lon.flatMap((lon, i) => [lon, line.lat[i]]));
  viewer.entities.add({
    name: `${bundle.course.name} course`,
    polyline: { positions, width: 5, clampToGround: true, material: Color.fromCssColorString("#d0342c") },
  });

  const last = line.km.length - 1;
  addMarker(viewer, "Start", line.lat[0], line.lon[0]);
  addMarker(viewer, "Finish", line.lat[last], line.lon[last]);

  frameCourse(viewer, line.lat, line.lon);
}

function addMarker(viewer: Viewer, text: string, lat: number, lon: number): void {
  viewer.entities.add({
    position: Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 10, color: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND },
    label: {
      text,
      font: "14px sans-serif",
      style: LabelStyle.FILL_AND_OUTLINE,
      fillColor: Color.BLACK,
      outlineColor: Color.WHITE,
      outlineWidth: 3,
      verticalOrigin: VerticalOrigin.BOTTOM,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** Look at the whole course from the south, tilted so the city reads as 3D. */
function frameCourse(viewer: Viewer, lat: number[], lon: number[]): void {
  const sphere = BoundingSphere.fromPoints(lat.map((la, i) => Cartesian3.fromDegrees(lon[i], la)));
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), sphere.radius * 2.6),
    duration: 0,
  });
}
