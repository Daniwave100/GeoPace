// Hills: the height, the grade, and the effort a grade costs compared with flat ground, read from
// the Course Bundle's measured course line. Pure lookups, no drawing: the strip, the sentence and
// the map all ask this module, so they can't disagree about where a hill is.
//
// One honesty rule runs through all of it (PLAN.md principle 5). Some heights aren't measured:
// the Course Bundle lists the stretches where the height is a straight line between measured
// points (a bridge deck the ground model leaves out, a gap in a scan). Everything here carries
// that through, so nothing downstream can draw a filled-in height in the same ink as a survey.
import type { CourseBundle, NotMeasuredSpan } from "../bundle/types";
import { clamp, nearestIndex } from "./series";

/** A grade a runner would call a hill, as rise over run. Below it, the road reads as flat. */
const HILL_GRADE = 0.01;
/** Two hills the same way up with less than this much flat between them are one hill. */
const SAME_HILL_GAP_KM = 0.15;
/** Less height than this, up or down, isn't worth marking: a kerb ramp, an underpass dip. */
const MIN_HILL_HEIGHT_M = 5;
/**
 * Where gentle, a proper hill and steep begin, as a percentage, up or down alike. Chosen so that
 * all three show on New York (about 10 km, 7 km and 3 km of it) and Berlin is gentle throughout,
 * which is what runners say of both.
 */
const STEEPNESS_STEPS = [HILL_GRADE * 100, 2, 3.5];

/** 0 flat · 1 gentle · 2 a proper hill · 3 steep. */
export type Steepness = 0 | 1 | 2 | 3;

/** How steep a grade is, going up or coming down: a ramp down off a bridge hurts too. */
export function steepnessLevel(gradePercent: number): Steepness {
  return STEEPNESS_STEPS.filter((step) => Math.abs(gradePercent) >= step).length as Steepness;
}

export interface HillsAt {
  elevationM: number;
  /** Rise over run as a percentage: 4 is 4% uphill. */
  gradePercent: number;
  /** Energy cost relative to flat ground, or null where the grade is outside the model's range. */
  difficulty: number | null;
  /** Why the height here is not measured, in words for the runner; null where it is measured. */
  notMeasured: string | null;
}

export function hillsAt(bundle: CourseBundle, km: number): HillsAt {
  const line = bundle.measured.course_line;
  const position = clamp(km, line.km[0], line.km[line.km.length - 1]);
  const i = nearestIndex(line.km, position);
  return {
    elevationM: line.elevation_m[i],
    gradePercent: line.grade[i] * 100,
    difficulty: line.difficulty[i],
    notMeasured: spanAt(bundle.measured.elevation_not_measured, position)?.reason ?? null,
  };
}

/** One slice of the course, as wide as the strip can draw. */
export interface HillBin {
  startKm: number;
  midKm: number;
  endKm: number;
  elevationM: number;
  gradePercent: number;
  /** null if any sample in the bin is outside the difficulty model: a hole is never averaged away. */
  difficulty: number | null;
  /** false if any part of the bin is filled in rather than measured. */
  measured: boolean;
}

/** The whole course cut into `binCount` equal slices, each with the mean of its samples. */
export function hillBins(bundle: CourseBundle, binCount: number): HillBin[] {
  const line = bundle.measured.course_line;
  const lengthKm = line.length_m / 1000;
  const width = lengthKm / binCount;
  const bins: HillBin[] = [];
  let sample = 0;
  for (let b = 0; b < binCount; b += 1) {
    const startKm = b * width;
    const endKm = b === binCount - 1 ? lengthKm : startKm + width;
    let count = 0;
    let elevation = 0;
    let grade = 0;
    let difficulty = 0;
    let outsideModel = false;
    while (sample < line.km.length && line.km[sample] <= endKm) {
      elevation += line.elevation_m[sample];
      grade += line.grade[sample];
      const cost = line.difficulty[sample];
      if (cost === null) outsideModel = true;
      else difficulty += cost;
      count += 1;
      sample += 1;
    }
    // A bin narrower than the sample spacing can come up empty: it takes the nearest sample.
    const nearest = count > 0 ? undefined : hillsAt(bundle, (startKm + endKm) / 2);
    bins.push({
      startKm,
      midKm: (startKm + endKm) / 2,
      endKm,
      elevationM: nearest ? nearest.elevationM : elevation / count,
      gradePercent: nearest ? nearest.gradePercent : (grade / count) * 100,
      difficulty: nearest ? nearest.difficulty : outsideModel ? null : difficulty / count,
      measured: !bundle.measured.elevation_not_measured.some((span) => span.km_start < endKm && span.km_end > startKm),
    });
  }
  return bins;
}

/** A sustained climb or descent: what gets marked on the map when Hills is on. */
export interface HillStretch {
  kind: "climb" | "descent";
  fromKm: number;
  toKm: number;
  /** Height gained over the stretch; negative on a descent. */
  gainM: number;
  meanGradePercent: number;
  /** How many of its km rest on filled-in height. 0 when all of it is measured. */
  notMeasuredKm: number;
}

/** Every climb and descent a runner would call a hill, in course order, never overlapping. */
export function hillStretches(bundle: CourseBundle): HillStretch[] {
  const line = bundle.measured.course_line;
  const direction = (grade: number) => (grade >= HILL_GRADE ? 1 : grade <= -HILL_GRADE ? -1 : 0);

  // Runs of samples that all go the same way: up, down, or neither.
  const runs: { way: number; first: number; last: number }[] = [];
  line.grade.forEach((grade, i) => {
    const way = direction(grade);
    const current = runs[runs.length - 1];
    if (current && current.way === way) current.last = i;
    else runs.push({ way, first: i, last: i });
  });

  // A short flat step in the middle of a hill doesn't make it two hills.
  const hills: typeof runs = [];
  for (const run of runs) {
    const flat = hills[hills.length - 1];
    const before = hills[hills.length - 2];
    const briefFlat = flat && flat.way === 0 && line.km[flat.last] - line.km[flat.first] < SAME_HILL_GAP_KM;
    if (run.way !== 0 && before && briefFlat && before.way === run.way) {
      hills.pop();
      before.last = run.last;
    } else {
      hills.push({ ...run });
    }
  }

  return hills
    .filter((run) => run.way !== 0)
    .map((run): HillStretch => {
      const fromKm = line.km[run.first];
      const toKm = line.km[run.last];
      const gainM = line.elevation_m[run.last] - line.elevation_m[run.first];
      return {
        kind: run.way > 0 ? "climb" : "descent",
        fromKm,
        toKm,
        gainM,
        meanGradePercent: toKm > fromKm ? (gainM / ((toKm - fromKm) * 1000)) * 100 : 0,
        notMeasuredKm: bundle.measured.elevation_not_measured.reduce((sum, span) => sum + Math.max(0, Math.min(span.km_end, toKm) - Math.max(span.km_start, fromKm)), 0),
      };
    })
    .filter((hill) => Math.abs(hill.gainM) >= MIN_HILL_HEIGHT_M);
}

function spanAt(spans: NotMeasuredSpan[], km: number): NotMeasuredSpan | undefined {
  return spans.find((span) => km >= span.km_start && km <= span.km_end);
}
