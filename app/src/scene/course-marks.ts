// How a layer marks the course line on the map (PLAN.md D35): as stretches of the line itself,
// drawn wider underneath the blue, never as coloured areas or blobs over the map. Which look a
// stretch gets is decided by the kind of claim it is (core/encoding.ts) and, for a hill, by how
// steep it is (core/mark-look.ts). This file only turns that look into something CesiumJS can draw.
import { Color, type Entity, type MaterialProperty, PolylineDashMaterialProperty, PolylineOutlineMaterialProperty, type Viewer } from "cesium";
import type { CourseBundle } from "../bundle/types";
import type { LineMark } from "../core/layers";
import { type MarkLook, markLook } from "../core/mark-look";
import { nearestIndex } from "../core/series";
import { linePositions, Z_MARKS } from "./globe";

/** The marks on each map now, so the next layer's can take their place. */
const drawn = new WeakMap<Viewer, Entity[]>();

/** Replace whatever marks are on the course line with these. An empty list leaves the plain blue line. */
export function showLineMarks(viewer: Viewer, bundle: CourseBundle, marks: LineMark[]): void {
  for (const entity of drawn.get(viewer) ?? []) viewer.entities.remove(entity);
  const line = bundle.measured.course_line;
  const entities = marks.flatMap((mark) => {
    const first = nearestIndex(line.km, mark.fromKm);
    const last = nearestIndex(line.km, mark.toKm);
    if (last <= first) return [];
    const look = markLook(mark.encoding, mark.level);
    return [viewer.entities.add({ polyline: { positions: linePositions(line, first, last), width: look.widthPx, clampToGround: true, zIndex: Z_MARKS, material: material(look) } })];
  });
  drawn.set(viewer, entities);
}

function material(look: MarkLook): MaterialProperty {
  const color = Color.fromCssColorString(look.color);
  if (look.gap !== null) return new PolylineDashMaterialProperty({ color, gapColor: Color.fromCssColorString(look.gap), dashLength: 14 });
  return new PolylineOutlineMaterialProperty({ color, outlineColor: Color.fromCssColorString(look.edge), outlineWidth: look.edgePx });
}
