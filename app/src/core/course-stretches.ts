// The course line cut into stretches, each drawn on the map as one line: a stretch one or two
// layers have marked (PLAN.md D35, D62), or the plain course between marks. A stretch also says
// whether its height is measured (D45): at the road's own height in photoreal a filled-in stretch
// is known to be a few metres off the road, so it is never hidden for it (scene/placement.ts).
//
// Two slots, one line. A layer paints either the band — wide and coloured, beside the blue — or the
// rim, a dark stripe hugging it; so a hill's colour and the shade over it can both be on the same
// stretch, and the one line that paints the blue paints both (scene/course-ribbon.ts). Nothing is
// ever laid over anything else (D52). A stretch ends wherever either slot changes.
import type { NotMeasuredSpan } from "../bundle/types";
import type { LineMark, LineSlot } from "./layers";
import { nearestIndex } from "./series";

/** Samples `first` to `last` of the course line. A stretch ends on the sample the next one starts on, so the drawn line has no holes. */
export interface CourseStretch {
  first: number;
  last: number;
  /** What a layer says about this stretch in the band, or null for nothing there. */
  band: LineMark | null;
  /** And in the rim. */
  rim: LineMark | null;
  measured: boolean;
}

/** Which slot a mark is painted in: the band unless it says otherwise. */
export function slotOf(mark: LineMark): LineSlot {
  return mark.slot ?? "band";
}

/** The whole course as stretches, in order. Where two marks overlap in one slot, the later one in the list has the stretch. */
export function courseStretches(km: number[], marks: LineMark[], gaps: NotMeasuredSpan[]): CourseStretch[] {
  const steps = km.length - 1; // step i runs from sample i to sample i + 1
  const band = new Array<LineMark | null>(steps).fill(null);
  const rim = new Array<LineMark | null>(steps).fill(null);
  const measured = new Array<boolean>(steps).fill(true);
  for (const mark of marks) (slotOf(mark) === "rim" ? rim : band).fill(mark, nearestIndex(km, mark.fromKm), nearestIndex(km, mark.toKm));
  for (const gap of gaps) measured.fill(false, nearestIndex(km, gap.km_start), nearestIndex(km, gap.km_end));

  const stretches: CourseStretch[] = [];
  for (let step = 0; step < steps; step += 1) {
    const current = stretches[stretches.length - 1];
    if (current && current.band === band[step] && current.rim === rim[step] && current.measured === measured[step]) current.last = step + 1;
    else stretches.push({ first: step, last: step + 1, band: band[step], rim: rim[step], measured: measured[step] });
  }
  return stretches;
}
