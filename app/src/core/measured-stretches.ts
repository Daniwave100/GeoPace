// The course line cut where its height stops, or starts, being measured (PLAN.md D45). At the
// road's own height in photoreal the two kinds of stretch are drawn differently: where the height
// is filled in, the line is known to be off the road by a few metres, so it is never hidden for it.
import type { NotMeasuredSpan } from "../bundle/types";
import { nearestIndex } from "./series";

/** Samples `first` to `last` of the course line. A stretch ends on the sample the next one starts on, so the drawn line has no holes. */
export interface LineStretch {
  first: number;
  last: number;
  measured: boolean;
}

/** The whole course as stretches, in order. `gaps` are in course order and never overlap (the Course Bundle's promise). */
export function stretchesByMeasured(km: number[], gaps: NotMeasuredSpan[]): LineStretch[] {
  const stretches: LineStretch[] = [];
  let reached = 0;
  for (const gap of gaps) {
    const first = nearestIndex(km, gap.km_start);
    const last = nearestIndex(km, gap.km_end);
    if (last <= first) continue;
    if (first > reached) stretches.push({ first: reached, last: first, measured: true });
    stretches.push({ first, last, measured: false });
    reached = last;
  }
  if (reached < km.length - 1) stretches.push({ first: reached, last: km.length - 1, measured: true });
  return stretches;
}
