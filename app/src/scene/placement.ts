// Where the course is put in the 3D scene, and what CesiumJS is asked to draw for it.
//
// Draped: painted onto the surface of the keyless map along the route. Right there, because
// nothing stands over the road, and because the open terrain is too coarse to agree with surveyed
// heights (a line at its own height would sink into it or hang above it). Draped things rest on our
// own open terrain only, never on photoreal imagery, even while that imagery is arriving and both
// are on screen.
//
// At road height: drawn at the height the pipeline measured for each point of the course line (the
// Course Bundle's ellipsoid_height_m), lifted a little. Right in photoreal, where a draped line
// lands on tree canopies, bridge cables and the Queensboro's upper deck, and slides against the
// road as the camera moves (issue #22).
//
// Either way the height comes from our own data. Nothing here reads, or rests anything on, Google's
// surface, which is for looking at only (PLAN.md D5).
import { ArcType, Cartesian3, ClassificationType, HeightReference, type PolylineGraphics } from "cesium";
import type { CourseLine } from "../bundle/types";
import type { MarkLook } from "../core/mark-look";
import type { RoadPosition } from "../core/scrub";
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
   * The lift: how far above the measured road the line is drawn. Google's photographed surface and
   * a surveyed road don't agree to better than a metre or so, and traffic is baked into it as
   * bumps: too low and the line sinks into the road in patches, too high and a runner can see under it.
   */
  liftM: 1.5,
  /** Hidden is the truth, but a line that vanishes under every tree is a worse map: it stays, fainter. */
  behind: "faint" as Behind,
  /**
   * Where the height is filled in, not measured (the middle of the Verrazzano's main span), the
   * line is a few metres under the real deck, so the deck is in front of it. That is our gap, not
   * the runner's: the line is never hidden for it, whatever `behind` says. Fainter, not full
   * strength: a filled-in stretch must never look more sure of itself than a measured one (D45).
   */
  behindWhereNotMeasured: "faint" as Exclude<Behind, "hidden">,
  faintAlpha: 0.45,
};

/** A place on the course in the scene: on the ellipsoid when draped (CesiumJS then finds our terrain under it), at the road's height, lifted, otherwise. */
export function scenePosition(place: Pick<RoadPosition, "lat" | "lon" | "ellipsoidHeightM">, placement: Placement): Cartesian3 {
  return placement === "draped" ? Cartesian3.fromDegrees(place.lon, place.lat) : Cartesian3.fromDegrees(place.lon, place.lat, place.ellipsoidHeightM + ROAD_LOOK.liftM);
}

/** How a dot (the runner, the start, the finish) is held at `scenePosition`: a dot resting on terrain and one standing at a height are different things to CesiumJS. */
export function heightReference(placement: Placement): HeightReference {
  return placement === "draped" ? HeightReference.CLAMP_TO_TERRAIN : HeightReference.NONE;
}

/**
 * What CesiumJS draws for one stretch of the course line: one line, the plain course or, with a
 * `look`, the course with a layer's mark beside it.
 */
export function stretchGraphics(line: CourseLine, stretch: { first: number; last: number; measured: boolean }, look: MarkLook | null, placement: Placement): PolylineGraphics.ConstructorOptions {
  const asItIs = { positions: positionsAlong(line, stretch, placement), width: ribbonWidthPx(look), material: new CourseRibbonProperty(look, 1) };
  if (placement === "draped") return { ...asItIs, clampToGround: true, classificationType: ClassificationType.TERRAIN };
  const behind = stretch.measured ? ROAD_LOOK.behind : ROAD_LOOK.behindWhereNotMeasured;
  return {
    ...asItIs,
    clampToGround: false,
    // Samples are metres apart: a straight line between two of them never leaves the road.
    arcType: ArcType.NONE,
    depthFailMaterial: behind === "hidden" ? undefined : new CourseRibbonProperty(look, behind === "faint" ? ROAD_LOOK.faintAlpha : 1),
  };
}

function positionsAlong(line: CourseLine, stretch: { first: number; last: number }, placement: Placement): Cartesian3[] {
  const positions: Cartesian3[] = [];
  for (let i = stretch.first; i <= stretch.last; i += 1) positions.push(scenePosition({ lat: line.lat[i], lon: line.lon[i], ellipsoidHeightM: line.ellipsoid_height_m[i] }, placement));
  return positions;
}
