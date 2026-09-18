// Stand-in content for the design mockups.
//
// Nothing in this file is a claim about the world. The layers here (sun exposure, wind, aid
// stations, GPS reports) belong to pipelines that don't exist yet — issues #9 to #13 — but the
// mockups need something on screen to judge a design against, and judging a layout against empty
// space is worthless. So these numbers are invented, deterministic, and every one of them travels
// with `sample: true` so the UI can shout about it. The project's rule that every fact carries a
// source URL applies to facts; these are placeholders, and the only honest source for a
// placeholder is the issue that will replace it.
//
// The *shapes* are real: sun exposure is a range because leaf state is unknowable (D7), wind is a
// meteorological "from" direction, aid stations sit on the organizer's certified kilometres and
// have to be converted onto the course line (D20).

export interface SampleEdition {
  /** Local calendar date of the race edition. */
  date: string;
  /** Whether the date is confirmed against an official source, or still believed (PLAN.md §5). */
  dateVerified: boolean;
  /** Why we believe the date — a URL when verified, a plain note when not. */
  dateNote: string;
  waveLabel: string;
  waveStartLocal: string;
}

/** Race dates are real; wave times are invented until #5 adds sourced edition facts. */
export const SAMPLE_EDITIONS: Record<string, SampleEdition> = {
  berlin: {
    date: "2026-09-27",
    dateVerified: true,
    dateNote: "https://www.bmw-berlin-marathon.com/en/your-race/course/",
    waveLabel: "Wave 2",
    waveStartLocal: "09:15",
  },
  nyc: {
    date: "2026-11-01",
    dateVerified: false,
    dateNote: "Believed, not yet verified with NYRR — and the day US clocks go back.",
    waveLabel: "Wave 2 · Blue",
    waveStartLocal: "10:40",
  },
};

export const FALLBACK_EDITION: SampleEdition = {
  date: "2026-09-27",
  dateVerified: false,
  dateNote: "No edition facts for this course yet.",
  waveLabel: "Wave 1",
  waveStartLocal: "09:00",
};

/** Prevailing wind, invented per course, as a meteorological "blows from" bearing. */
export const SAMPLE_PREVAILING_WIND: Record<string, { fromDeg: number; speedMs: number }> = {
  berlin: { fromDeg: 250, speedMs: 4.2 },
  nyc: { fromDeg: 310, speedMs: 5.1 },
};

/**
 * The street model's invented buildings: a seed so a course's blocks are the same on every
 * reload, and a ceiling so Manhattan reads taller than Berlin. Not data about either city.
 */
export const SAMPLE_MASSING: Record<string, { seed: number; maxHeightM: number }> = {
  berlin: { seed: 3, maxHeightM: 30 },
  nyc: { seed: 7, maxHeightM: 64 },
};

export const FALLBACK_MASSING = { seed: 1, maxHeightM: 30 };

export interface SampleAidStation {
  /** Kilometre on the organizer's certified scale — converted onto the course line before use. */
  certifiedKm: number;
  offers: string[];
}

/** A conventional marathon layout: fluids from 5 km, something sweet once it starts to hurt. */
export const SAMPLE_AID_STATIONS: SampleAidStation[] = [
  { certifiedKm: 5, offers: ["water"] },
  { certifiedKm: 10, offers: ["water", "sports drink"] },
  { certifiedKm: 15, offers: ["water"] },
  { certifiedKm: 20, offers: ["water", "sports drink"] },
  { certifiedKm: 25, offers: ["water", "sports drink", "gel"] },
  { certifiedKm: 30, offers: ["water", "sports drink", "gel"] },
  { certifiedKm: 35, offers: ["water", "sports drink"] },
  { certifiedKm: 40, offers: ["water"] },
];

export interface SampleNote {
  /** Kilometre on the course line. */
  km: number;
  kind: "gps" | "crowd" | "surface";
  text: string;
}

/**
 * Subjective notes, written in the voice a paraphrased forum report would use. Invented: the real
 * ones arrive with links in #13, and the rule there is paraphrase-and-link, never a copied post.
 */
export const SAMPLE_NOTES: Record<string, SampleNote[]> = {
  berlin: [
    { km: 12.4, kind: "crowd", text: "Runners describe the Karl-Marx-Allee stretch as loud and wide — easy to drift off the tangent." },
    { km: 24.6, kind: "gps", text: "Reports of watches over-reading through the narrow Schöneberg blocks." },
    { km: 38.8, kind: "surface", text: "Cobbled patches mentioned near Potsdamer Platz; runners advise the smoother left side." },
  ],
  nyc: [
    { km: 1.1, kind: "gps", text: "The bridge deck is a known dead spot; watches commonly lose lock on the upper level." },
    { km: 15.2, kind: "crowd", text: "Bedford Avenue is described as the loudest stretch before Manhattan." },
    { km: 25.4, kind: "gps", text: "Runners report drift under the Queensboro's upper deck, then a jump on First Avenue." },
    { km: 34.1, kind: "surface", text: "The Madison Avenue Bridge grating is called out as slick when wet." },
  ],
};

/**
 * Smooth, repeatable pseudo-randomness along a course, so a "sample" layer looks like terrain
 * rather than static, and looks the same on every reload.
 */
export function sampleNoise(seed: number, position: number): number {
  const whole = Math.floor(position);
  const fraction = position - whole;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const from = hash01(whole, seed);
  const to = hash01(whole + 1, seed);
  return from + (to - from) * eased;
}

function hash01(value: number, seed: number): number {
  let h = Math.imul(value ^ (seed * 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}
