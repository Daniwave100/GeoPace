// The course on the map: the blue line (PLAN.md D28: blue means the course and where you are on
// it, and nothing else), a dot at its start and its finish, and whatever the layer that is on
// marks along it (D35): stretches of the line itself, drawn wider, never coloured areas or blobs
// over the map. Which look a marked stretch gets is decided by the kind of claim it is
// (core/encoding.ts) and, for a hill, by how steep it is (core/mark-look.ts). This file turns
// that into things CesiumJS can draw: one line per stretch (core/course-stretches.ts), draped or
// at the road's own height (placement.ts).
import { Color, type Entity, type EntityCollection, HeightReference, type JulianDate } from "cesium";
import type { CourseBundle, CourseLine } from "../bundle/types";
import { courseStretches } from "../core/course-stretches";
import type { LineMark } from "../core/layers";
import { markLook } from "../core/mark-look";
import { type Placement, scenePosition, stretchGraphics } from "./placement";

/** As much of the CesiumJS viewer as drawing the course and the runner touches: the list of what is drawn, and the clock. */
export interface SceneForCourse {
  entities: EntityCollection;
  clock: { currentTime: JulianDate };
}

/** What is drawn for the course on each map now, so the next course, layer or placement can take its place. */
const drawn = new WeakMap<SceneForCourse, Entity[]>();

/** Draw one course, with these marks on it, in place of whatever course was drawn. No marks leaves the plain blue line. */
export function showCourseLine(viewer: SceneForCourse, bundle: CourseBundle, marks: LineMark[], placement: Placement): void {
  for (const entity of drawn.get(viewer) ?? []) viewer.entities.remove(entity);
  const line = bundle.measured.course_line;
  const stretches = courseStretches(line.km, marks, bundle.measured.elevation_not_measured);
  drawn.set(viewer, [
    ...stretches.map((stretch) => {
      const look = stretch.mark ? markLook(stretch.mark.encoding, stretch.mark.howMuch) : null;
      return viewer.entities.add({ name: `${bundle.course.name} course`, polyline: stretchGraphics(line, stretch.first, stretch.last, look, placement, stretch.measured) });
    }),
    endDot(viewer, line, 0, placement),
    endDot(viewer, line, line.km.length - 1, placement),
  ]);
}

function endDot(viewer: SceneForCourse, line: CourseLine, sample: number, placement: Placement): Entity {
  return viewer.entities.add({
    position: scenePosition({ lat: line.lat[sample], lon: line.lon[sample], roadHeightM: line.ellipsoid_height_m[sample] }, placement),
    point: { pixelSize: 8, color: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, heightReference: heightReference(placement), disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
}

/** A dot clamped to the ground and one standing at a height are different things to CesiumJS. */
export function heightReference(placement: Placement): HeightReference {
  return placement === "draped" ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE;
}
