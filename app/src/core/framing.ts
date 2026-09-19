// Framing the course on the map. The poster's blocks are laid over the map (PLAN.md D32), so the
// middle of the map is not the middle of what the runner can see: the readout block covers the
// left of it. The camera looks to the course's left by half of what is covered, which puts the
// course in the middle of the part that is clear.

/**
 * How far down the camera looks when it frames the course: from above, tilted enough that the city
 * reads as 3D. The map's own moves are measured against it — how much room a camera at a given
 * height needs outside the vicinity it must stay in (core/map-bounds.ts), and how far out it may
 * be taken — so that the bounds and the framing can never disagree.
 */
export const CAMERA_TILT_RAD = (60 * Math.PI) / 180;

/** The map as the camera sees it, and how much of it is under a block. */
export interface MapView {
  /** The camera's horizontal field of view, radians. */
  fovRad: number;
  viewWidthPx: number;
  viewHeightPx: number;
  /** How much of the view's left side is under a block. */
  coveredLeftPx: number;
}

/**
 * How far to the course's left the camera should look, in meters, from `rangeM` away, so the
 * course lands in the middle of the part of the map that is clear rather than the middle of the map.
 */
export function sidewaysShiftM(view: MapView & { rangeM: number }): number {
  const { rangeM, fovRad, viewWidthPx, coveredLeftPx } = view;
  if (viewWidthPx <= 0 || coveredLeftPx <= 0) return 0;
  const visibleWidthM = 2 * rangeM * Math.tan(fovRad / 2);
  return (Math.min(coveredLeftPx, viewWidthPx) / 2 / viewWidthPx) * visibleWidthM;
}

export interface CourseInView extends MapView {
  /** Radius of the sphere round the whole course, meters. */
  radiusM: number;
  /** How far down the camera looks, radians below the horizon: PI/2 is straight down. */
  tiltRad: number;
}

/** A little air round the course, so its ends aren't on the edge of the map. */
const MARGIN = 1.15;

/**
 * How far back the camera has to stand for the whole course to be in view. The map is often a
 * letterbox (wide, and not tall once the strip opens), so the course has to fit both ways: across
 * the part of the width that no block covers, and up the height. Up the height, what decides it
 * is the near end of the course: a tilted camera stands to the south, so the southern end is the
 * closest thing to it and lands lowest on the screen.
 */
export function rangeToFitM({ radiusM, tiltRad, fovRad, viewWidthPx, viewHeightPx, coveredLeftPx }: CourseInView): number {
  if (viewWidthPx <= 0 || viewHeightPx <= 0) return radiusM * 3;
  const halfWidth = Math.tan(fovRad / 2); // per meter of range, at the middle of the view
  const halfHeightRad = Math.atan(halfWidth * (viewHeightPx / viewWidthPx));
  const clear = Math.max(0.3, 1 - coveredLeftPx / viewWidthPx);
  const acrossM = radiusM / (halfWidth * clear);

  // The smallest range that keeps the near end on screen. There is no tidy formula, and the
  // answer only ever shrinks as the camera backs away, so: halve the interval until it is found.
  let tooClose = radiusM * 0.01;
  let farEnough = radiusM * 1000;
  for (let step = 0; step < 60; step += 1) {
    const range = (tooClose + farEnough) / 2;
    if (nearEndBelowCentreRad(range, radiusM, tiltRad) > halfHeightRad) tooClose = range;
    else farEnough = range;
  }
  return Math.max(acrossM, farEnough) * MARGIN;
}

/**
 * How far below the middle of the view the near end of the course appears, as an angle. The
 * camera is `rangeM` from the middle of the course, looking down at it by `tiltRad`.
 */
export function nearEndBelowCentreRad(rangeM: number, radiusM: number, tiltRad: number): number {
  const heightM = rangeM * Math.sin(tiltRad);
  const backM = rangeM * Math.cos(tiltRad); // how far south of the course's middle the camera stands
  return Math.PI / 2 - tiltRad - Math.atan2(backM - radiusM, heightM);
}
