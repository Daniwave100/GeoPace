// Hills, as a layer: the first one the layer system ships with (#6). Its rows on the strip are
// the grade and the effort a grade costs; its marks on the map are the climbs and descents a
// runner would call a hill; its clause says what the road is doing underfoot. The height itself is
// the strip's own base row (`heightRow`), there whether or not Hills is on.
//
// All of it is measured (solid), except where the Course Bundle says the height is filled in:
// those stretches come out as not measured here, on every surface.
import type { CourseBundle, NotMeasuredSpan } from "../bundle/types";
import { type HillBin, hillBins, hillsAt, type HillStretch, hillStretches, steepnessLevel } from "./hills";
import type { Layer, LineMark, MarkLabel, MarkLevel, RowBin, StripRow } from "./layers";
import { nearestIndex } from "./series";
import { formatHeight, formatNearby, heightNumber, heightUnit } from "./units";

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
      return { text: `${signed(at.gradePercent)}%`, notMeasured: at.notMeasured };
    },
    // The same three steps as the marks on the map, so the strip and the map agree about what is steep.
    levels: (count) => binned(count).map((bin) => steepnessLevel(bin.gradePercent)),
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
      if (at.difficulty === null) return { text: "no number", notMeasured: `The grade here is outside the range the effort model was measured over. ${bundle.measured.difficulty_model.description}` };
      return { text: `${signed((at.difficulty - 1) * 100, 0)}%`, notMeasured: at.notMeasured };
    },
  };

  // Worked out once: the climbs and descents don't change while a course is on screen.
  const hills = hillStretches(bundle);
  // With Hills on, every stretch whose height is filled in is greyed on the course line, hill or
  // not: the strip and the sentence grey all of them, and the map must not say less than they do.
  const marks: LineMark[] = [
    ...hills.flatMap((hill) => piecesBySteepness(hill, bundle).flatMap((piece) => measuredParts(piece, gaps))),
    ...gaps.map((gap): LineMark => ({ fromKm: gap.km_start, toKm: gap.km_end, encoding: "not-measured" })),
  ].sort((a, b) => a.fromKm - b.fromKm);
  const labels = hills.map((hill) => hillLabel(hill, gaps));

  return {
    id: "hills",
    name: "Hills",
    key: "A coloured edge on the blue line is a hill, up or down: pale yellow is gentle, orange is a proper hill, dark red is steep.",
    rows: () => [gradeRow, effortRow],
    lineMarks: () => marks,
    lineLabels: () => labels,
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
  return {
    id: "height",
    name: "Height",
    encoding: "measured",
    scale: (units) => `${heightUnit(units)}, ${heightNumber(min_m, units)} to ${heightNumber(max_m, units)}`,
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
      return { text: formatHeight(at.elevationM, units), notMeasured: at.notMeasured };
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

/** A run of one steepness shorter than this joins the run before it: a mark isn't confetti. */
const MIN_PIECE_KM = 0.06;

/** One hill, cut where it changes from gentle to a proper hill to steep. Every part of a hill is at least gentle. */
function piecesBySteepness(hill: HillStretch, bundle: CourseBundle): LineMark[] {
  const line = bundle.measured.course_line;
  const first = nearestIndex(line.km, hill.fromKm);
  const last = nearestIndex(line.km, hill.toKm);
  const pieces: LineMark[] = [];
  for (let i = first; i < last; i += 1) {
    const level = Math.max(1, steepnessLevel(line.grade[i] * 100)) as Exclude<MarkLevel, 0>;
    const current = pieces[pieces.length - 1];
    if (current && current.level === level) current.toKm = line.km[i + 1];
    else pieces.push({ fromKm: line.km[i], toKm: line.km[i + 1], encoding: "measured", level });
  }
  // A few metres at another steepness, where the grade hovers round a step, join what came before.
  return pieces.reduce<LineMark[]>((kept, piece) => {
    const before = kept[kept.length - 1];
    if (before && (piece.toKm - piece.fromKm < MIN_PIECE_KM || before.level === piece.level)) before.toKm = piece.toKm;
    else kept.push({ ...piece });
    return kept;
  }, []);
}

/** The parts of a piece of hill whose height is measured: the piece, with every filled-in stretch cut out of it. */
function measuredParts(piece: LineMark, gaps: NotMeasuredSpan[]): LineMark[] {
  const parts: LineMark[] = [];
  let reached = piece.fromKm;
  for (const gap of gaps.filter((candidate) => candidate.km_start < piece.toKm && candidate.km_end > piece.fromKm)) {
    if (gap.km_start > reached) parts.push({ ...piece, fromKm: reached, toKm: gap.km_start });
    reached = Math.max(reached, Math.min(gap.km_end, piece.toKm));
  }
  if (reached < piece.toKm) parts.push({ ...piece, fromKm: reached });
  return parts;
}

/**
 * One label for the whole hill. It says what kind of claim the hill is: not measured if most of
 * its height is filled in, and otherwise measured, with a note if part of it is.
 */
function hillLabel(hill: HillStretch, gaps: NotMeasuredSpan[]): MarkLabel {
  const filledIn = gaps.find((gap) => gap.km_start < hill.toKm && gap.km_end > hill.fromKm);
  return {
    encoding: hill.notMeasuredKm > (hill.toKm - hill.fromKm) / 2 ? "not-measured" : "measured",
    note: filledIn ? `Part of this hill is not measured. ${filledIn.reason}` : undefined,
    atKm: (hill.fromKm + hill.toKm) / 2,
    startKm: hill.fromKm,
    text: (units) => `${hill.kind === "climb" ? "Up" : "Down"} ${Math.abs(hill.meanGradePercent).toFixed(1)}% · ${formatNearby(hill.toKm - hill.fromKm, units)}`,
    priority: Math.abs(hill.gainM),
  };
}

/** "+3.4", "−1.1", and a plain "0.0" for level ground: no sign on nothing. */
function signed(percent: number, digits = 1): string {
  const rounded = Math.abs(percent).toFixed(digits);
  if (Number(rounded) === 0) return rounded;
  return `${percent > 0 ? "+" : MINUS}${rounded}`;
}
