// How a layer marks the course line on the map (PLAN.md D35): as stretches of the line itself,
// drawn wider underneath the blue, never as coloured areas or blobs over the map. Which look a
// stretch gets is decided by the kind of claim it is (core/encoding.ts), so the map uses the
// same four encodings as the strip and the sentence:
//   solid = measured · hollow = what runners say · grey dashes = not measured here · stripes = sample.
import { Color, type Entity, type MaterialProperty, PolylineDashMaterialProperty, PolylineOutlineMaterialProperty, type Viewer } from "cesium";
import type { CourseBundle } from "../bundle/types";
import { ENCODINGS, type EncodingStyle } from "../core/encoding";
import type { LineMark } from "../core/layers";
import { nearestIndex } from "../core/series";
import { linePositions, Z_MARKS } from "./globe";

/** Wide enough to show either side of the blue line. */
const MARK_WIDTH_PX = 16;

const INK = Color.BLACK;
const PAPER = Color.fromCssColorString("#f4f4f0");
const GREY = Color.fromCssColorString("#8a8a86");

const MATERIALS: Record<EncodingStyle["mapLine"], () => MaterialProperty> = {
  // Ink, with a hairline of paper round it so it still reads on dark imagery.
  solid: () => new PolylineOutlineMaterialProperty({ color: INK, outlineColor: PAPER, outlineWidth: 1 }),
  hollow: () => new PolylineOutlineMaterialProperty({ color: PAPER, outlineColor: INK, outlineWidth: 3 }),
  "grey-dashes": () => new PolylineDashMaterialProperty({ color: GREY, gapColor: PAPER, dashLength: 14 }),
  stripes: () => new PolylineDashMaterialProperty({ color: INK, gapColor: PAPER, dashLength: 28, dashPattern: 0b1111000011110000 }),
};

let drawn: Entity[] = [];

/** Replace whatever marks are on the course line with these. An empty list leaves the plain blue line. */
export function showLineMarks(viewer: Viewer, bundle: CourseBundle, marks: LineMark[]): void {
  for (const entity of drawn) viewer.entities.remove(entity);
  const line = bundle.measured.course_line;
  drawn = marks.flatMap((mark) => {
    const first = nearestIndex(line.km, mark.fromKm);
    const last = nearestIndex(line.km, mark.toKm);
    if (last <= first) return [];
    return [
      viewer.entities.add({
        polyline: { positions: linePositions(line, first, last), width: MARK_WIDTH_PX, clampToGround: true, zIndex: Z_MARKS, material: MATERIALS[ENCODINGS[mark.encoding].mapLine]() },
      }),
    ];
  });
}
