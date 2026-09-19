// The map stays in the city (issue #25): the bounds in core/map-bounds.ts, put on the camera.
//
// Two walls, and between them the map is moved as freely as ever. **How far from the course:**
// before every frame, a camera looking outside the vicinity is moved back until it is looking
// inside it again — each way round on its own, so a drag along a wall slides along it, and every
// frame, so a drag stops dead at it rather than the map drifting off and snapping back afterwards.
//
// **How far out** is CesiumJS's own `maximumZoomDistance`, kept up to date here, so the wheel, a
// pinch and a middle-drag are all held to it with no code of ours; the zoom buttons ask
// core/map-bounds.ts for the same floor (scene/globe.ts).
//
// The camera is left alone whenever it isn't the map's own (`theMapsOwn`): the Ride's camera and
// free look are tied to the runner, who is on the course, and one of the map's own flights is left
// to land.
import { Cartesian3, type Cartographic, type Event, Math as CesiumMath } from "cesium";
import type { MapView } from "../core/framing";
import { farthestOutM, type Vicinity, whereTheCameraMayStand } from "../core/map-bounds";

/** As much of the CesiumJS viewer as the map's bounds touch. */
export interface SceneForBounds {
  camera: {
    readonly positionCartographic: Cartographic;
    readonly heading: number;
    readonly pitch: number;
    readonly roll: number;
    setView(options: { destination: Cartesian3; orientation: { heading: number; pitch: number; roll: number } }): void;
  };
  scene: {
    preRender: Event;
    screenSpaceCameraController: { maximumZoomDistance: number };
  };
}

export interface MapBoundsOptions {
  /** The vicinity of the course that is showing: nothing at all while none is, and then the map is unbounded. */
  vicinity(): Vicinity | undefined;
  /**
   * Whether the camera is the map's own: not the Ride's, not the runner's in free look (both are
   * tied to the runner on the course, and free look's own bounds keep it nearer than the vicinity
   * is wide), and not in the middle of one of the map's own flights, which is left to land.
   */
  theMapsOwn(): boolean;
  /** The map as the camera sees it, for the zoom floor (core/framing.ts). */
  mapView(): MapView;
}

/** Keep the map in the vicinity of the course that is showing, from now on. */
export function keepTheMapInTheVicinity(viewer: SceneForBounds, options: MapBoundsOptions): void {
  const { camera } = viewer;
  viewer.scene.preRender.addEventListener(() => {
    const vicinity = options.vicinity();
    if (!vicinity) return;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = farthestOutM(vicinity, options.mapView());
    if (!options.theMapsOwn()) return;

    const eye = camera.positionCartographic;
    const place = { lat: CesiumMath.toDegrees(eye.latitude), lon: CesiumMath.toDegrees(eye.longitude) };
    const kept = whereTheCameraMayStand(vicinity, {
      ...place,
      heightM: eye.height,
      headingDeg: CesiumMath.toDegrees(camera.heading),
      pitchDeg: CesiumMath.toDegrees(camera.pitch),
    });
    if (kept.lat === place.lat && kept.lon === place.lon) return;
    // The view itself is untouched — the same heading, the same tilt, the same height — so only
    // where the map is looking from has moved, and by no more than it had gone too far.
    camera.setView({
      destination: Cartesian3.fromDegrees(kept.lon, kept.lat, eye.height),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    });
  });
}
