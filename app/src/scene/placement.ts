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
import { ArcType, Cartesian3, Color, type MaterialProperty, type PolylineGraphics, PolylineDashMaterialProperty, PolylineOutlineMaterialProperty } from "cesium";
import type { CourseLine } from "../bundle/types";

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

/** What lies on what, bottom to top: a mark's band, the dashes on a band, the blue course line. */
export type Level = 0 | 1 | 2;
export const LEVEL_MARK: Level = 0;
export const LEVEL_DASHES: Level = 1;
export const LEVEL_COURSE: Level = 2;
/**
 * At road height there is no "on top", only nearer the camera: each level sits this much higher
 * than the one under it. Enough for the scene to tell them apart from 50 km up, too little to see
 * from the roadside.
 */
const LEVEL_STEP_M = 0.15;

/** One line to draw along a stretch of the course. Colours are #rrggbb. */
export interface Stroke {
  widthPx: number;
  color: string;
  /** A solid line's edge. */
  edge?: { color: string; px: number };
  /** Makes it dashed, with this between the dashes. */
  gap?: string;
  level: Level;
}

/** A place on the course in the scene: on the ellipsoid when draped (CesiumJS then finds the ground), at the road's height otherwise. */
export function scenePosition(place: { lat: number; lon: number; roadHeightM: number }, placement: Placement, level: Level = LEVEL_COURSE): Cartesian3 {
  return placement === "draped" ? Cartesian3.fromDegrees(place.lon, place.lat) : Cartesian3.fromDegrees(place.lon, place.lat, heightInScene(place.roadHeightM, level));
}

/** What CesiumJS draws for one stroke along samples `first` to `last` of the course line. */
export function strokeGraphics(line: CourseLine, first: number, last: number, stroke: Stroke, placement: Placement, measured = true): PolylineGraphics.ConstructorOptions {
  if (placement === "draped") {
    return { positions: linePositions(line, first, last), width: stroke.widthPx, clampToGround: true, zIndex: stroke.level + 1, material: material(stroke, 1) };
  }
  const behind = measured ? ROAD_LOOK.behind : ROAD_LOOK.behindWhereNotMeasured;
  return {
    positions: roadPositions(line, first, last, stroke.level),
    width: stroke.widthPx,
    clampToGround: false,
    // Samples are 10 m apart: a straight line between two of them never leaves the road.
    arcType: ArcType.NONE,
    material: material(stroke, 1),
    depthFailMaterial: behind === "hidden" ? undefined : material(stroke, behind === "faint" ? ROAD_LOOK.faintAlpha : 1),
  };
}

/** The course line's positions between two of its samples, on the ellipsoid: for draping, and for framing the camera. */
export function linePositions(line: CourseLine, first: number, last: number): Cartesian3[] {
  const degrees: number[] = [];
  for (let i = first; i <= last; i += 1) degrees.push(line.lon[i], line.lat[i]);
  return Cartesian3.fromDegreesArray(degrees);
}

function roadPositions(line: CourseLine, first: number, last: number, level: Level): Cartesian3[] {
  const degreesAndHeights: number[] = [];
  for (let i = first; i <= last; i += 1) degreesAndHeights.push(line.lon[i], line.lat[i], heightInScene(line.ellipsoid_height_m[i], level));
  return Cartesian3.fromDegreesArrayHeights(degreesAndHeights);
}

function heightInScene(roadHeightM: number, level: Level): number {
  return roadHeightM + ROAD_LOOK.liftM + level * LEVEL_STEP_M;
}

function material(stroke: Stroke, alpha: number): MaterialProperty {
  const color = Color.fromCssColorString(stroke.color).withAlpha(alpha);
  if (stroke.gap !== undefined) return new PolylineDashMaterialProperty({ color, gapColor: Color.fromCssColorString(stroke.gap).withAlpha(alpha), dashLength: 14 });
  const edge = stroke.edge ?? { color: stroke.color, px: 0 };
  return new PolylineOutlineMaterialProperty({ color, outlineColor: Color.fromCssColorString(edge.color).withAlpha(alpha), outlineWidth: edge.px });
}
