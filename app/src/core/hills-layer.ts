// Hills, as a layer: the first one the layer system ships with (#6). Its rows on the strip are
// the grade and the effort a grade costs; its marks on the map are the climbs and descents a
// runner would call a hill; its clause says what the road is doing underfoot. The height profile
// itself is the strip's own base row (`heightRow`), there whether or not Hills is on.
//
// All of it is measured (solid), except where the Course Bundle says the height is filled in:
// those stretches come out as not measured here, on every surface.
import type { CourseBundle, NotMeasuredSpan } from "../bundle/types";
import { type HillBin, hillBins, hillsAt, type HillStretch, hillStretches } from "./hills";
import type { Layer, LineMark, RowBin, StripRow } from "./layers";
import { formatHeight, formatNearby, heightUnit, metersToFeet, type Units } from "./units";

/** Below this, a runner calls the road flat. Half a percent is 5 m of height in a kilometre. */
const FLAT_BELOW_PERCENT = 0.5;

const MINUS = "−"; // a true minus sign, as wide as the plus: the numbers don't jiggle while scrubbing

export function hillsLayer(bundle: CourseBundle): Layer {
  const line = bundle.measured.course_line;
  const gaps = bundle.measured.elevation_not_measured;
  const steepest = Math.max(...line.grade.map((grade) => Math.abs(grade))) * 100;
  const gradeReach = Math.max(1, Math.ceil(steepest));
  const effortReach = Math.max(0.08, ...line.difficulty.map((cost) => Math.abs((cost ?? 1) - 1)));
  const binned = memoBins(bundle);

  const gradeRow: StripRow = {
    id: "grade",
    name: "Grade",
    encoding: "measured",
    scale: () => `%, ${signed(Math.min(...line.grade) * 100)} to ${signed(Math.max(...line.grade) * 100)}`,
    bins: (count) => binned(count).map((bin) => rowBin(bin, bin.gradePercent)),
    domain: [-gradeReach, gradeReach],
    baseline: 0,
    stepped: false,
    valueAt(km) {
      const at = hillsAt(bundle, km);
      return { text: `${signed(at.gradePercent)}%`, notMeasured: at.notMeasured !== null, note: at.notMeasured ?? undefined };
    },
  };

  const effortRow: StripRow = {
    id: "effort",
    name: "Effort",
    encoding: "measured",
    // The model and its source are named under Sources; the header has room for what it means.
    scale: () => "energy vs flat ground",
    bins: (count) => binned(count).map((bin) => rowBin(bin, bin.difficulty)),
    domain: [1 - effortReach, 1 + effortReach],
    baseline: 1,
    stepped: true,
    valueAt(km) {
      const at = hillsAt(bundle, km);
      // Outside the model's range there is no number to give, which is its own kind of "not known".
      if (at.difficulty === null) return { text: "no number", notMeasured: true, note: bundle.measured.difficulty_model.description };
      return { text: `${signed((at.difficulty - 1) * 100, 0)}%`, notMeasured: at.notMeasured !== null, note: at.notMeasured ?? undefined };
    },
  };

  return {
    id: "hills",
    name: "Hills",
    rows: () => [gradeRow, effortRow],
    lineMarks: () => hillStretches(bundle).flatMap((hill) => marksFor(hill, gaps)),
    clause(km) {
      const at = hillsAt(bundle, km);
      const percent = Math.round(Math.abs(at.gradePercent));
      const text = Math.abs(at.gradePercent) < FLAT_BELOW_PERCENT ? "Flat." : `${at.gradePercent > 0 ? "Climbing" : "Downhill"} ${Math.max(percent, 1)}%.`;
      return at.notMeasured === null ? { text, encoding: "measured" } : { text, encoding: "not-measured", note: at.notMeasured };
    },
  };
}

/** The strip's own base row: the height of the course, there whether or not a layer is on. */
export function heightRow(bundle: CourseBundle): StripRow {
  const { min_m, max_m, gain_m, loss_m } = bundle.measured.elevation_summary;
  const binned = memoBins(bundle);
  const shown = (meters: number, units: Units) => Math.round(units === "mi" ? metersToFeet(meters) : meters);
  return {
    id: "height",
    name: "Height",
    encoding: "measured",
    scale: (units) => `${heightUnit(units)}, ${shown(min_m, units)} to ${shown(max_m, units)}`,
    // Every rise and every drop along the course added up: what "a hilly course" means in one number.
    summary: (units) => `up ${formatHeight(gain_m, units)}, down ${formatHeight(loss_m, units)}`,
    bins: (count) => binned(count).map((bin) => rowBin(bin, bin.elevationM)),
    // Not from sea level: Berlin moves 20 m all day, and drawn from zero it is a slab. The
    // labelled scale says where the bottom is.
    domain: [min_m - (max_m - min_m) * 0.12, max_m],
    baseline: "bottom",
    stepped: false,
    valueAt(km, units) {
      const at = hillsAt(bundle, km);
      return { text: formatHeight(at.elevationM, units), notMeasured: at.notMeasured !== null, note: at.notMeasured ?? undefined };
    },
  };
}

function rowBin(bin: HillBin, value: number | null): RowBin {
  return { startKm: bin.startKm, midKm: bin.midKm, endKm: bin.endKm, value, measured: bin.measured };
}

/** The strip redraws at the same width far more often than the width changes. */
function memoBins(bundle: CourseBundle): (count: number) => HillBin[] {
  let last: { count: number; bins: HillBin[] } | undefined;
  return (count) => {
    if (last?.count !== count) last = { count, bins: hillBins(bundle, count) };
    return last.bins;
  };
}

/**
 * One hill as pieces of course line: solid where its height is measured, not measured where it
 * is filled in. The hill's one label goes on its first measured piece (or its only piece).
 */
function marksFor(hill: HillStretch, gaps: NotMeasuredSpan[]): LineMark[] {
  const cuts = gaps.filter((gap) => gap.km_start < hill.toKm && gap.km_end > hill.fromKm);
  const pieces: LineMark[] = [];
  let reached = hill.fromKm;
  for (const gap of cuts) {
    if (gap.km_start > reached) pieces.push({ fromKm: reached, toKm: gap.km_start, encoding: "measured" });
    pieces.push({ fromKm: Math.max(gap.km_start, reached), toKm: Math.min(gap.km_end, hill.toKm), encoding: "not-measured" });
    reached = Math.min(gap.km_end, hill.toKm);
  }
  if (reached < hill.toKm) pieces.push({ fromKm: reached, toKm: hill.toKm, encoding: "measured" });

  const labelled = pieces.find((piece) => piece.encoding === "measured") ?? pieces[0];
  labelled.label = {
    atKm: (hill.fromKm + hill.toKm) / 2,
    startKm: hill.fromKm,
    text: (units) => `${hill.kind === "climb" ? "Up" : "Down"} ${Math.abs(hill.meanGradePercent).toFixed(1)}% · ${formatNearby(hill.toKm - hill.fromKm, units)}`,
    priority: Math.abs(hill.gainM),
  };
  return pieces;
}

/** "+3.4", "−1.1", and a plain "0.0" for level ground: no sign on nothing. */
function signed(percent: number, digits = 1): string {
  const rounded = Math.abs(percent).toFixed(digits);
  if (Number(rounded) === 0) return rounded;
  return `${percent > 0 ? "+" : MINUS}${rounded}`;
}
