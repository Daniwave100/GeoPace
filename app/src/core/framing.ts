// Framing the course on the map. The poster's blocks are laid over the map (PLAN.md D32), so the
// middle of the map is not the middle of what the runner can see: the readout block covers the
// left of it. The camera slides sideways by half of what is covered, which puts the course in
// the middle of the part that is clear.

export interface Framing {
  /** Distance from the camera to the middle of the course, meters. */
  rangeM: number;
  /** The camera's horizontal field of view, radians. */
  fovRad: number;
  viewWidthPx: number;
  /** How much of the view's left side is under a block. */
  coveredLeftPx: number;
}

/** Meters to move the camera to its left, so the course moves right into the clear part of the view. */
export function sidewaysShiftM({ rangeM, fovRad, viewWidthPx, coveredLeftPx }: Framing): number {
  if (viewWidthPx <= 0 || coveredLeftPx <= 0) return 0;
  const visibleWidthM = 2 * rangeM * Math.tan(fovRad / 2);
  return (Math.min(coveredLeftPx, viewWidthPx) / 2 / viewWidthPx) * visibleWidthM;
}
