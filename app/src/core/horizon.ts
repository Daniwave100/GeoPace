// Whether a place on the Earth can be seen from where the camera is, or is round the back of the
// globe. Labels over the map are plain HTML, so nothing hides them when the runner zooms far out
// and the course goes over the horizon: this does. It is the standard horizon test, done in a
// space squashed so the ellipsoid becomes a unit sphere.

export interface Xyz {
  x: number;
  y: number;
  z: number;
}

/** `radii` are the ellipsoid's three radii; `camera` and `point` are Earth-centred, in meters. */
export function isOverTheHorizon(camera: Xyz, point: Xyz, radii: Xyz): boolean {
  const c = { x: camera.x / radii.x, y: camera.y / radii.y, z: camera.z / radii.z };
  const toPoint = { x: point.x / radii.x - c.x, y: point.y / radii.y - c.y, z: point.z / radii.z - c.z };
  // How far the horizon is from the camera, squared; negative if the camera is under the surface.
  const toHorizonSquared = c.x * c.x + c.y * c.y + c.z * c.z - 1;
  if (toHorizonSquared < 0) return false;
  const towardsCentre = -(toPoint.x * c.x + toPoint.y * c.y + toPoint.z * c.z);
  const distanceSquared = toPoint.x * toPoint.x + toPoint.y * toPoint.y + toPoint.z * toPoint.z;
  // Beyond the horizon's distance, and inside the cone the globe fills.
  return towardsCentre > toHorizonSquared && (towardsCentre * towardsCentre) / distanceSquared > toHorizonSquared;
}
