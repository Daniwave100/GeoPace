// How a layer marks the course line on the map (PLAN.md D35): as stretches of the line itself,
// drawn wider underneath the blue, never as coloured areas or blobs over the map. Which look a
// stretch gets is decided by the kind of claim it is (core/encoding.ts) and, for a hill, by how
// steep it is (core/mark-look.ts). This file only turns that look into something CesiumJS can
// draw, draped or at the road's height like the course line itself (placement.ts).
import type { Entity } from "cesium";
import type { CourseBundle } from "../bundle/types";
import type { LineMark } from "../core/layers";
import { type MarkLook, markLook } from "../core/mark-look";
import { nearestIndex } from "../core/series";
import type { SceneForCourse } from "./globe";
import { LEVEL_DASHES, LEVEL_MARK, type Placement, type Stroke, strokeGraphics } from "./placement";

/** The marks on each map now, so the next layer's can take their place. */
const drawn = new WeakMap<SceneForCourse, Entity[]>();

/** Replace whatever marks are on the course line with these. An empty list leaves the plain blue line. */
export function showLineMarks(viewer: SceneForCourse, bundle: CourseBundle, marks: LineMark[], placement: Placement): void {
  for (const entity of drawn.get(viewer) ?? []) viewer.entities.remove(entity);
  const line = bundle.measured.course_line;
  const entities = marks.flatMap((mark) => {
    const first = nearestIndex(line.km, mark.fromKm);
    const last = nearestIndex(line.km, mark.toKm);
    if (last <= first) return [];
    const measured = mark.encoding !== "not-measured";
    return strokes(markLook(mark.encoding, mark.howMuch)).map((stroke) => viewer.entities.add({ polyline: strokeGraphics(line, first, last, stroke, placement, measured) }));
  });
  drawn.set(viewer, entities);
}

/**
 * A solid mark is one line with an edge. A dashed one is two: a band in the colour between the
 * dashes, with the edge round it, and the dashes laid along its middle, narrower than the band,
 * so the band runs unbroken down both sides of them (core/mark-look.ts says why).
 */
function strokes(look: MarkLook): Stroke[] {
  const edge = { color: look.edge, px: look.edgePx };
  if (look.gap === null) return [{ widthPx: look.widthPx, color: look.color, edge, level: LEVEL_MARK }];
  return [
    { widthPx: look.widthPx, color: look.gap, edge, level: LEVEL_MARK },
    { widthPx: look.widthPx - 2 * (look.edgePx + look.rimPx), color: look.color, gap: look.gap, level: LEVEL_DASHES },
  ];
}
