// The course on the map: the blue line (PLAN.md D28: blue means the course and where you are on
// it, and nothing else) and whatever the layers that are on mark along it (D35, D62): stretches of
// the line itself, drawn wider, never coloured areas or blobs over the map. Which look a marked
// stretch gets is decided by the kind of claim it is (core/encoding.ts), the slot it is painted in
// — a hill's band, shade's rim — and, for a hill, by how steep it is (core/mark-look.ts). This file turns
// that into things CesiumJS can draw: one line per stretch (core/course-stretches.ts), draped or
// at the road's own height (placement.ts). The runner and the dots at the two ends are not in the
// scene at all: they are laid over the map (map-dots.ts), where no line can be painted over them.
import type { Entity, EntityCollection } from "cesium";
import type { CourseBundle } from "../bundle/types";
import { courseStretches } from "../core/course-stretches";
import type { LineMark } from "../core/layers";
import { markLook, type RibbonLook, rimLook } from "../core/mark-look";
import { type Placement, stretchGraphics } from "./placement";

/** As much of the CesiumJS viewer as drawing the course touches: the list of what is drawn. */
export interface SceneForCourse {
  entities: EntityCollection;
}

/** What is drawn for the course on each map now, so the next course, layer or placement can take its place. */
const drawn = new WeakMap<SceneForCourse, Entity[]>();

/** Draw one course, with these marks on it, in place of whatever course was drawn. No marks leaves the plain blue line. */
export function showCourseLine(viewer: SceneForCourse, bundle: CourseBundle, marks: LineMark[], placement: Placement): void {
  for (const entity of drawn.get(viewer) ?? []) viewer.entities.remove(entity);
  const line = bundle.measured.course_line;
  const stretches = courseStretches(line.km, marks, bundle.measured.elevation_not_measured);
  drawn.set(
    viewer,
    stretches.map((stretch) => {
      const look: RibbonLook | null =
        stretch.band || stretch.rim ? { band: stretch.band ? markLook(stretch.band.encoding, stretch.band.howMuch) : null, rim: stretch.rim ? rimLook(stretch.rim.encoding) : null } : null;
      return viewer.entities.add({ name: `${bundle.course.name} course`, polyline: stretchGraphics(line, stretch, look, placement) });
    }),
  );
}
