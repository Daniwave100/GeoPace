// The place in the middle of the map: where the camera's line of sight through the middle of the
// canvas meets the ground. "Straight down" keeps it in the middle as it tips the view over.
//
// It is found on a surface through the ground under the camera, not on the WGS84 ellipsoid. Sea
// level is 32.5 m below the ellipsoid in New York, so a camera a few metres over a street there (the
// Ride's On the road) is inside the ellipsoid, and asked where its line of sight meets it CesiumJS
// answers with the far side of the world: the map went to the Atlantic. In Berlin the ground is
// 73 m above the ellipsoid, and the same line of sight went through the ground to meet it 680 m on.
// The ground's height is our own open terrain's (scene/globe.ts), never photoreal imagery's.
import { Cartesian2, Cartesian3, Cartographic, Ellipsoid } from "cesium";

/** As much of the CesiumJS camera as this touches. */
export interface CameraForTheMiddle {
  readonly positionCartographic: Cartographic;
  pickEllipsoid(windowPosition: Cartesian2, ellipsoid?: Ellipsoid): Cartesian3 | undefined;
}

/** `groundM` is the ground's height above the ellipsoid under the camera. Looking at the sky, the middle of the map is the place straight under the camera. */
export function middleOfTheMap(camera: CameraForTheMiddle, canvas: { clientWidth: number; clientHeight: number }, groundM: number): Cartesian3 | undefined {
  const { x, y, z } = Ellipsoid.WGS84.radii;
  const ground = new Ellipsoid(x + groundM, y + groundM, z + groundM);
  const eye = camera.positionCartographic;
  // A camera at or under the ground it is asked about would be inside this surface too: nothing to meet.
  if (eye.height <= groundM) return undefined;
  return camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), ground) ?? Cartesian3.fromRadians(eye.longitude, eye.latitude, groundM);
}
