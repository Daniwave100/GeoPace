// How high the camera is above the ground, for photoreal's key panel.
import { Cartographic, type Event, sampleTerrainMostDetailed, type TerrainProvider } from "cesium";

/** Each height is a question to the terrain service: a couple a second keep up with a Ride. */
const ASK_EVERY_MS = 500;

interface Watched {
  camera: { positionCartographic: Cartographic };
  scene: { postRender: Event };
  terrainProvider: TerrainProvider;
}

/**
 * Tells `onHeight` how high the camera is above the open terrain (never the photoreal surface,
 * PLAN.md D5), or null when the terrain can't say. Returns a function that stops watching.
 *
 * It was measured when CesiumJS said the camera had come to rest, and the Ride moves the camera
 * every frame, so it never rests: a Ride kept the height from before it all the way along (#52).
 * It is measured after a frame is drawn instead, when the camera is the one that frame was drawn
 * from: earlier, while the Ride is holding the camera, it can be one CesiumJS nudged, a view nobody
 * sees (scene/ride-camera.ts). Only when the camera has moved, no more than every ASK_EVERY_MS, and
 * one question at a time, so a slow terrain service is never piled on.
 * `sample` is CesiumJS's own lookup and `now` the clock; a test holds back one and runs the other.
 */
export function watchCameraHeight(
  viewer: Watched,
  onHeight: (meters: number | null) => void,
  { sample = sampleTerrainMostDetailed, now = () => performance.now() } = {},
): () => void {
  let watching = true;
  let asking = false;
  let askedAtMs = -Infinity;
  let askedOf: Cartographic | undefined;
  const measure = async (eye: Cartographic): Promise<void> => {
    asking = true;
    let meters: number | null = null;
    try {
      const [ground] = await sample(viewer.terrainProvider, [Cartographic.clone(eye)]);
      if (Number.isFinite(ground.height)) meters = eye.height - ground.height;
    } catch {
      // The terrain is best-effort (PLAN.md D16). No height is better than a wrong one.
    }
    asking = false;
    if (watching) onHeight(meters);
  };
  const stopListening = viewer.scene.postRender.addEventListener(() => {
    const eye = viewer.camera.positionCartographic;
    if (asking || now() - askedAtMs < ASK_EVERY_MS || (askedOf && Cartographic.equals(eye, askedOf))) return;
    askedAtMs = now();
    askedOf = Cartographic.clone(eye);
    void measure(askedOf);
  });
  return () => {
    watching = false; // an answer still on its way is no longer wanted
    stopListening();
  };
}
