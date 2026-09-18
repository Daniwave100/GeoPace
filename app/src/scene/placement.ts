// Where the course is put in the 3D scene, and what CesiumJS is asked to draw for it.
//
// Draped: painted onto whatever surface the map shows above the route. Right on the keyless map,
// where nothing stands over the road, and where the open terrain is too coarse to agree with
// surveyed heights (a 3D line would sink into it or float).
//
// At road height: drawn in 3D at the height the pipeline measured for each point of the course
// line (the Course Bundle's ellipsoid_height_m), a little above it. Right in photoreal, where a
// draped line lands on tree canopies, bridge cables and the Queensboro's upper deck, and slides
// against the road as the camera moves (issue #22). The height comes from our own data; nothing
// here reads Google's surface, which is for looking at only (PLAN.md D5).
import { ArcType, Cartesian3, type PolylineGraphics } from "cesium";
import type { CourseLine } from "../bundle/types";
import type { MarkLook } from "../core/mark-look";
import { CourseRibbonProperty, ribbonWidthPx } from "./course-ribbon";

export type Placement = "draped" | "road-height";

/** What is left of a line where something stands between it and the camera: a tree, a tower, the deck above. */
export type Behind = "hidden" | "faint" | "solid";

/**
 * The look at road height. 🟡 Claude's starting values: the owner settles them by eye, with their
 * own key, from the trial on the branch prototype/line-on-road (PLAN.md D52).
 */
export const ROAD_LOOK = {
  /**
   * How far above the measured road the line floats. Google's photographed surface and a surveyed
   * road don't agree to better than a metre or so, and traffic is baked into it as bumps: too
   * low and the line sinks into the road in patches, too high and it visibly floats.
   */
  liftM: 1.5,
  /** Hidden is the truth, but a line that vanishes under every tree is a worse map: it stays, fainter. */
  behind: "faint" as Behind,
  /**
   * Where the height is filled in, not measured (the middle of the Verrazzano's main span), the
   * line is a few metres under the real deck. That is our gap, not the runner's: it shows through.
   */
  behindWhereNotMeasured: "solid" as Behind,
  faintAlpha: 0.45,
};

/** A place on the course in the scene: on the ellipsoid when draped (CesiumJS then finds the ground), at the road's height otherwise. */
export function scenePosition(place: { lat: number; lon: number; roadHeightM: number }, placement: Placement): Cartesian3 {
  return placement === "draped" ? Cartesian3.fromDegrees(place.lon, place.lat) : Cartesian3.fromDegrees(place.lon, place.lat, place.roadHeightM + ROAD_LOOK.liftM);
}

/**
 * What CesiumJS draws for samples `first` to `last` of the course line: one line, the plain course
 * or the course with a layer's `mark` beside it. `measured` is whether the height there is.
 */
export function stretchGraphics(line: CourseLine, first: number, last: number, mark: MarkLook | null, placement: Placement, measured: boolean): PolylineGraphics.ConstructorOptions {
  const asItIs = { width: ribbonWidthPx(mark), material: new CourseRibbonProperty(mark, 1) };
  if (placement === "draped") return { ...asItIs, positions: linePositions(line, first, last), clampToGround: true };
  const behind = measured ? ROAD_LOOK.behind : ROAD_LOOK.behindWhereNotMeasured;
  return {
    ...asItIs,
    positions: roadPositions(line, first, last),
    clampToGround: false,
    // Samples are 10 m apart: a straight line between two of them never leaves the road.
    arcType: ArcType.NONE,
    depthFailMaterial: behind === "hidden" ? undefined : new CourseRibbonProperty(mark, behind === "faint" ? ROAD_LOOK.faintAlpha : 1),
  };
}

/** The course line's positions between two of its samples, on the ellipsoid: for draping. */
function linePositions(line: CourseLine, first: number, last: number): Cartesian3[] {
  const degrees: number[] = [];
  for (let i = first; i <= last; i += 1) degrees.push(line.lon[i], line.lat[i]);
  return Cartesian3.fromDegreesArray(degrees);
}

function roadPositions(line: CourseLine, first: number, last: number): Cartesian3[] {
  const degreesAndHeights: number[] = [];
  for (let i = first; i <= last; i += 1) degreesAndHeights.push(line.lon[i], line.lat[i], line.ellipsoid_height_m[i] + ROAD_LOOK.liftM);
  return Cartesian3.fromDegreesArrayHeights(degreesAndHeights);
}
