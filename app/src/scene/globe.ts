// The 3D globe: keyless basemap and terrain, with the course drawn on the ground.
import {
  BoundingSphere,
  Cartesian3,
  CesiumTerrainProvider,
  Color,
  Credit,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  Terrain,
  VerticalOrigin,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CourseBundle } from "../bundle/types";
import { BASEMAP, TERRAIN } from "./providers";

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

  return viewer;
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
