// The course line cut into stretches, each drawn on the map as one line: a stretch a layer has
// marked (PLAN.md D35), or the plain course between two marks. A stretch also says whether its
// height is measured (D45): at the road's own height in photoreal a filled-in stretch is known to
// be a few metres off the road, so it is never hidden for it (scene/placement.ts).
//
// One line per stretch, never one laid over another: what a layer marks is painted beside the blue
// by the same line that paints the blue, so nothing can come out on top of the course.
import type { NotMeasuredSpan } from "../bundle/types";
import type { LineMark } from "./layers";
import { nearestIndex } from "./series";

/** Samples `first` to `last` of the course line. A stretch ends on the sample the next one starts on, so the drawn line has no holes. */
export interface CourseStretch {
  first: number;
  last: number;
  /** What a layer says about this stretch, or null for the plain course. */
  mark: LineMark | null;
  measured: boolean;
}

/** The whole course as stretches, in order. Where two marks overlap, the later one in the list has the stretch. */
export function courseStretches(km: number[], marks: LineMark[], gaps: NotMeasuredSpan[]): CourseStretch[] {
  const steps = km.length - 1; // step i runs from sample i to sample i + 1
  const markOf = new Array<LineMark | null>(steps).fill(null);
  const measured = new Array<boolean>(steps).fill(true);
  for (const mark of marks) markOf.fill(mark, nearestIndex(km, mark.fromKm), nearestIndex(km, mark.toKm));
  for (const gap of gaps) measured.fill(false, nearestIndex(km, gap.km_start), nearestIndex(km, gap.km_end));

  const stretches: CourseStretch[] = [];
  for (let step = 0; step < steps; step += 1) {
    const current = stretches[stretches.length - 1];
    if (current && current.mark === markOf[step] && current.measured === measured[step]) current.last = step + 1;
    else stretches.push({ first: step, last: step + 1, mark: markOf[step], measured: measured[step] });
  }
  return stretches;
}
