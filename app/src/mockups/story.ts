// What the three mockups are all showing.
//
// One course, one race plan, one set of layers aligned by kilometre — the km strip as the spine of
// the UI (PLAN.md D14). The three designs differ in how they draw this; none of them differs in
// what it draws. That is the whole point: put identical content behind three visual languages and
// the choice becomes visible instead of theoretical.
//
// Measured layers come from the committed Course Bundle and carry the pipeline's sources. Sample
// layers come from sample-data.ts and carry `sample: true` everywhere they surface.
import type { CourseBundle } from "../bundle/types";
import { type Side, type WindOnRunner, sunOnRunner, windOnRunner } from "../core/bearing";
import { type CarriedOver, createPlanner, defaultPlan, plannerCourse } from "../core/planner";
import { type RaceClock, raceClock } from "../core/race-clock";
import { clamp, nearestIndex } from "../core/series";
import { type SunPosition, sunPosition } from "../core/solar";
import {
  FALLBACK_MASSING,
  SAMPLE_AID_STATIONS,
  SAMPLE_MASSING,
  SAMPLE_NOTES,
  SAMPLE_PREVAILING_WIND,
  type SampleNote,
  sampleNoise,
} from "./sample-data";

/** How a number was arrived at. The two never share a visual encoding (product principle 3). */
export type Provenance = "measured" | "subjective";

export interface LayerMeta {
  id: "elevation" | "difficulty" | "landmarks" | "exposure" | "wind" | "aid" | "gps";
  label: string;
  provenance: Provenance;
  /** True while this layer's numbers are placeholders for a pipeline that isn't built. */
  sample: boolean;
  /** Where the real values come from: a source's title for measured layers, an issue for sample ones. */
  note: string;
  /** The source itself, when there is one to link to. */
  url?: string;
}

export interface AidStation {
  /** Position on the course line's own scale, converted from the organizer's certified km. */
  km: number;
  certifiedKm: number;
  offers: string[];
}

export interface Landmark {
  name: string;
  km: number;
  source: string;
}

export interface Exposure {
  /** Percent of the kilometre in direct sun with trees in full leaf — the shadier end of the range. */
  lowPercent: number;
  /** The same stretch counting buildings only. The gap between the two is trees (PLAN.md D7). */
  highPercent: number;
}

/**
 * A stretch where a "measured" column isn't really measured. PLAN.md §10 has this open: the
 * Course Bundle has no way to say "this is filled in", so until the schema grows one, the app has
 * to carry it or it will draw a guess in the same ink as a measurement.
 */
export interface UnmeasuredSpan {
  fromKm: number;
  toKm: number;
  reason: string;
  /** Points at an entry in the bundle's own `sources`, rather than restating a URL. */
  sourceId: string;
}

const UNMEASURED_ELEVATION: Record<string, UnmeasuredSpan[]> = {
  nyc: [
    {
      fromKm: 0.85,
      toKm: 1.45,
      reason: "No LiDAR returns over the middle of the Verrazzano's main span; the height here is a straight line between the measured deck either side, so the real crest is a few metres higher.",
      sourceId: "nyc-lidar-2017",
    },
  ],
};

export interface Readout {
  km: number;
  elapsedSeconds: number;
  /** Time of day in the course's own zone, HH:MM. */
  clock: string;
  zoneLabel: string;
  elevationM: number;
  /** False where the elevation is interpolated across a gap in the survey — show it grayed out. */
  elevationMeasured: boolean;
  gradePercent: number;
  /** Energy cost relative to flat, or null where the grade is outside the model's range. */
  difficulty: number | null;
  headingDeg: number;
  sun: SunPosition & { isUp: boolean; side: Side };
  /** Sample. */
  exposure: Exposure | null;
  /** Sample values, real convention: `fromDeg` is the direction the wind blows from. */
  wind: WindOnRunner & { fromDeg: number; speedMs: number };
  /** Sample: 0 open sky, 1 deep canyon. */
  canyonScore: number;
  nextAid: AidStation | undefined;
}

export interface StripBin {
  startKm: number;
  midKm: number;
  endKm: number;
  elevationM: number;
  minElevationM: number;
  maxElevationM: number;
  /** False if any part of the bin sits in a survey gap. */
  elevationMeasured: boolean;
  gradePercent: number;
  /** null where any sample in the bin falls outside the difficulty model — shown grayed out. */
  difficulty: number | null;
  /** Sample; null once the sun is down. */
  exposure: Exposure | null;
  /** Sample. */
  canyonScore: number;
  /** Sample: +1 a full headwind, -1 a full tailwind. */
  headwindFraction: number;
  /** Sample: wind speed, so a design can turn the fraction into m/s in the runner's face. */
  windSpeedMs: number;
}

/** The edition the mockups plan for: sourced edition facts from the Course Bundle (#5), not samples. */
export interface StoryEdition {
  /** Local calendar date of the race. */
  date: string;
  /** false when the organizer hasn't stated this edition's date; `dateNote` then says how it is known. */
  dateConfirmed: boolean;
  dateNote?: string;
  waveLabel: string;
  waveStartLocal: string;
  /** Set when the wave's start time is copied from an earlier edition: flag it, with the reason. */
  carriedOver: CarriedOver | null;
}

export interface CourseStory {
  course: { id: string; name: string; city: string; timezone: string };
  edition: StoryEdition;
  /** Sample: what the street model's invented buildings are generated from. */
  massing: { seed: number; maxHeightM: number };
  clock: RaceClock;
  lengthKm: number;
  elevation: { minM: number; maxM: number; gainM: number; lossM: number };
  layers: LayerMeta[];
  landmarks: Landmark[];
  aidStations: AidStation[];
  notes: SampleNote[];
  /** Stretches where a measured column is really an interpolation. */
  unmeasured: UnmeasuredSpan[];
  sources: CourseBundle["sources"];
  attributions: { text: string; url: string }[];
  at(km: number): Readout;
  strip(binCount: number): StripBin[];
}

export interface RacePlan {
  goalFinishSeconds: number;
}

/** Puts a kilometre measured on the certified course onto the course line's longer scale (D20). */
export function certifiedKmToLineKm(certifiedKm: number, bundle: CourseBundle): number {
  return certifiedKm * (bundle.measured.course_line.length_m / bundle.course.certified_distance_m);
}

export function buildStory(bundle: CourseBundle, plan: RacePlan): CourseStory {
  const line = bundle.measured.course_line;
  const courseId = bundle.course_id;
  // The mockups show a new runner's plan: the latest edition, its first wave with a published time.
  const planning = plannerCourse(bundle);
  const planned = createPlanner(planning, defaultPlan(planning));
  const edition: StoryEdition = {
    date: planned.edition.date.day,
    dateConfirmed: planned.edition.date.confirmed,
    dateNote: planned.edition.date.note,
    waveLabel: planned.wave.name,
    waveStartLocal: planned.wave.start_local,
    carriedOver: planned.carriedOver,
  };
  const prevailingWind = SAMPLE_PREVAILING_WIND[courseId] ?? { fromDeg: 270, speedMs: 4 };
  const lengthKm = line.length_m / 1000;

  const clock = raceClock({
    date: edition.date,
    timezone: bundle.course.timezone,
    waveStartLocal: edition.waveStartLocal,
    goalFinishSeconds: plan.goalFinishSeconds,
    lineLengthM: line.length_m,
    certifiedDistanceM: bundle.course.certified_distance_m,
  });

  const aidStations: AidStation[] = SAMPLE_AID_STATIONS.filter((station) => station.certifiedKm * 1000 < bundle.course.certified_distance_m).map(
    (station) => ({ km: certifiedKmToLineKm(station.certifiedKm, bundle), certifiedKm: station.certifiedKm, offers: station.offers }),
  );

  const unmeasured = UNMEASURED_ELEVATION[courseId] ?? [];
  const elevationMeasuredAt = (km: number) => !unmeasured.some((span) => km >= span.fromKm && km <= span.toKm);

  /** Sample: how enclosed the street is. Drives both the canyon score and the shade range. */
  const canyonAt = (km: number) => clamp(sampleNoise(1, km / 2.3) * 1.15 - 0.05, 0, 1);

  function sampleExposure(km: number, sun: SunPosition): Exposure | null {
    if (sun.altitudeDeg <= 0) return null;
    const openness = 1 - canyonAt(km);
    // A low sun is blocked by anything; a high sun gets into the street.
    const reach = Math.sqrt(clamp(Math.sin(sun.altitudeDeg * (Math.PI / 180)), 0, 1));
    const buildingsOnly = clamp(18 + 82 * openness * reach, 0, 100);
    const treeCut = 8 + 34 * sampleNoise(2, km / 1.7);
    return { lowPercent: Math.round(clamp(buildingsOnly - treeCut, 0, 100)), highPercent: Math.round(buildingsOnly) };
  }

  function sampleWindFrom(km: number): number {
    return (prevailingWind.fromDeg + (sampleNoise(3, km / 6) - 0.5) * 70 + 360) % 360;
  }

  function at(km: number): Readout {
    const position = clamp(km, 0, lengthKm);
    const i = nearestIndex(line.km, position);
    const sun = sunPosition(clock.instantAtKm(position), line.lat[i], line.lon[i]);
    const heading = line.bearing_deg[i];
    const fromDeg = sampleWindFrom(position);

    return {
      km: position,
      elapsedSeconds: clock.elapsedSecondsAtKm(position),
      clock: clock.localClockAtKm(position),
      zoneLabel: clock.zoneLabelAtKm(position),
      elevationM: line.elevation_m[i],
      elevationMeasured: elevationMeasuredAt(position),
      gradePercent: line.grade[i] * 100,
      difficulty: line.difficulty[i],
      headingDeg: heading,
      sun: { ...sun, isUp: sun.altitudeDeg > 0, side: sunOnRunner(heading, sun.azimuthDeg).side },
      exposure: sampleExposure(position, sun),
      wind: { ...windOnRunner(heading, fromDeg), fromDeg, speedMs: prevailingWind.speedMs },
      canyonScore: canyonAt(position),
      nextAid: aidStations.find((station) => station.km >= position - 0.02),
    };
  }

  function strip(binCount: number): StripBin[] {
    const bins: StripBin[] = [];
    const width = lengthKm / binCount;
    let sample = 0;
    for (let b = 0; b < binCount; b += 1) {
      const startKm = b * width;
      const endKm = b === binCount - 1 ? lengthKm : startKm + width;
      const midKm = (startKm + endKm) / 2;

      let sum = 0;
      let count = 0;
      let minElevationM = Infinity;
      let maxElevationM = -Infinity;
      let difficultySum = 0;
      let outsideModel = false;
      let gradeSum = 0;
      while (sample < line.km.length && line.km[sample] <= endKm) {
        const elevation = line.elevation_m[sample];
        sum += elevation;
        minElevationM = Math.min(minElevationM, elevation);
        maxElevationM = Math.max(maxElevationM, elevation);
        gradeSum += line.grade[sample];
        const difficulty = line.difficulty[sample];
        if (difficulty === null) outsideModel = true;
        else difficultySum += difficulty;
        count += 1;
        sample += 1;
      }
      // A bin narrower than the 10 m sample spacing can come up empty; fall back to the point.
      const middle = count > 0 ? undefined : at(midKm);
      const readout = at(midKm);

      bins.push({
        startKm,
        midKm,
        endKm,
        elevationM: count > 0 ? sum / count : (middle?.elevationM ?? 0),
        minElevationM: count > 0 ? minElevationM : (middle?.elevationM ?? 0),
        maxElevationM: count > 0 ? maxElevationM : (middle?.elevationM ?? 0),
        elevationMeasured: !unmeasured.some((span) => span.fromKm < endKm && span.toKm > startKm),
        gradePercent: count > 0 ? (gradeSum / count) * 100 : (middle?.gradePercent ?? 0),
        difficulty: outsideModel || count === 0 ? null : difficultySum / count,
        exposure: readout.exposure,
        canyonScore: readout.canyonScore,
        headwindFraction: readout.wind.headwindFraction,
        windSpeedMs: readout.wind.speedMs,
      });
    }
    return bins;
  }

  return {
    course: { id: courseId, name: bundle.course.name, city: bundle.course.city, timezone: bundle.course.timezone },
    edition,
    massing: SAMPLE_MASSING[courseId] ?? FALLBACK_MASSING,
    clock,
    lengthKm,
    elevation: {
      minM: bundle.measured.elevation_summary.min_m,
      maxM: bundle.measured.elevation_summary.max_m,
      gainM: bundle.measured.elevation_summary.gain_m,
      lossM: bundle.measured.elevation_summary.loss_m,
    },
    layers: layersFor(bundle),
    landmarks: bundle.course.landmarks.map((landmark) => ({ ...landmark })),
    aidStations,
    notes: SAMPLE_NOTES[courseId] ?? [],
    unmeasured,
    sources: bundle.sources,
    attributions: bundle.attributions,
    at,
    strip,
  };
}

function layersFor(bundle: CourseBundle): LayerMeta[] {
  const elevationSource = bundle.sources.find((source) => source.id.includes("dem") || source.id.includes("dgm1"));
  return [
    {
      id: "elevation",
      label: "Elevation & grade",
      provenance: "measured",
      sample: false,
      note: elevationSource ? elevationSource.title : "Official terrain model, smoothed before grade.",
      url: elevationSource?.url,
    },
    {
      id: "difficulty",
      label: "Difficulty",
      provenance: "measured",
      sample: false,
      note: bundle.measured.difficulty_model.name,
      url: bundle.measured.difficulty_model.source,
    },
    { id: "landmarks", label: "Landmarks", provenance: "measured", sample: false, note: "Each one sourced in the Course Bundle." },
    { id: "exposure", label: "Sun exposure", provenance: "measured", sample: true, note: "Placeholder — the shade pipeline is #9 and #10." },
    { id: "wind", label: "Wind", provenance: "measured", sample: true, note: "Placeholder — wind climatology is #11." },
    { id: "aid", label: "Aid stations", provenance: "measured", sample: true, note: "Placeholder layout — sourced stations are #12." },
    { id: "gps", label: "Runner reports", provenance: "subjective", sample: true, note: "Placeholder — paraphrased, linked reports are #13." },
  ];
}
