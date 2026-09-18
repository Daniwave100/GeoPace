// The content every mockup shows, defined once.
//
// "All three show the same sample content" is one of the acceptance criteria for choosing a
// design, and the reliable way to meet it is to make it structural: this module decides *what* is
// on screen and how honest each number is, and the three designs decide only how it looks.
//
// Three different kinds of honesty live here and they are not interchangeable:
//   • `sample`     — the number is invented, standing in for a pipeline that isn't built
//   • `assumption` — the number is real, but rests on a modelling choice worth stating
//   • `unknown`    — the number isn't known at all, and must render as a dash, never a value
import { formatElapsed } from "../core/race-clock";
import * as show from "./format";
import type { CourseStory, Provenance, Readout } from "./story";

export interface Field {
  key: string;
  label: string;
  value: string;
  provenance: Provenance;
  /** Invented data, standing in for an unbuilt pipeline. */
  sample: boolean;
  /** The modelling choice the value rests on, if any. */
  assumption?: string;
  /** True when there is no value — render a dash, grayed, never a number. */
  unknown?: boolean;
  detail?: string;
}

export interface Entry {
  kind: "landmark" | "aid" | "note";
  km: number;
  title: string;
  detail: string;
  provenance: Provenance;
  sample: boolean;
  /** A real source URL for measured entries; absent for placeholders. */
  source?: string;
}

/** The headline three: where you are, what time it is, how long you've been running. */
export function headlineFields(story: CourseStory, readout: Readout): Field[] {
  return [
    { key: "km", label: "Kilometre", value: show.km(readout.km), provenance: "measured", sample: false },
    {
      key: "clock",
      label: "Time of day",
      value: `${readout.clock}`,
      provenance: "measured",
      sample: false,
      assumption: `${story.edition.waveLabel} start time is a placeholder until #5 adds sourced edition facts`,
      detail: readout.zoneLabel,
    },
    {
      key: "elapsed",
      label: "Elapsed",
      value: formatElapsed(readout.elapsedSeconds),
      provenance: "measured",
      sample: false,
      assumption: "even pace — real runners slow down; grade-adjusted pacing is Tier 2",
    },
  ];
}

/** Everything the km strip's layers say about this point on the course. */
export function layerFields(story: CourseStory, readout: Readout): Field[] {
  const aid = readout.nextAid;
  return [
    {
      key: "elevation",
      label: "Elevation",
      value: readout.elevationMeasured ? show.metres(readout.elevationM) : show.metres(readout.elevationM),
      provenance: "measured",
      sample: false,
      unknown: !readout.elevationMeasured,
      detail: readout.elevationMeasured ? undefined : gapReason(story, readout.km),
    },
    { key: "grade", label: "Grade", value: show.grade(readout.gradePercent), provenance: "measured", sample: false },
    {
      key: "difficulty",
      label: "Difficulty",
      value: show.difficulty(readout.difficulty),
      provenance: "measured",
      sample: false,
      unknown: readout.difficulty === null,
      detail: show.difficultyWords(readout.difficulty),
    },
    {
      key: "sun",
      label: "Sun",
      value: show.sunWords(readout),
      provenance: "measured",
      sample: false,
      assumption: "computed for the placeholder wave time above",
    },
    {
      key: "exposure",
      label: "In the sun",
      value: show.exposure(readout.exposure),
      provenance: "measured",
      sample: true,
      detail: "buildings only at the top of the range; full-leaf trees at the bottom",
    },
    { key: "wind", label: "Wind", value: show.windWords(readout), provenance: "measured", sample: true },
    {
      key: "aid",
      label: "Next aid",
      value: aid ? `${show.km(aid.km)} km · ${aid.offers.join(", ")}` : show.NOT_KNOWN,
      provenance: "measured",
      sample: true,
      unknown: !aid,
      detail: aid ? `organizer km ${aid.certifiedKm}, converted onto the course line` : undefined,
    },
  ];
}

function gapReason(story: CourseStory, km: number): string | undefined {
  return story.unmeasured.find((span) => km >= span.fromKm && km <= span.toKm)?.reason;
}

/** What is around the runner right now: the next landmark, the next aid, any reports nearby. */
export function entriesNear(story: CourseStory, km: number, noteRangeKm = 2.5): Entry[] {
  const entries: Entry[] = [];

  const landmark = story.landmarks.find((candidate) => candidate.km >= km) ?? story.landmarks[story.landmarks.length - 1];
  if (landmark) {
    entries.push({
      kind: "landmark",
      km: landmark.km,
      title: landmark.name,
      detail: `${(landmark.km - km >= 0 ? "in " : "passed ") + show.km(Math.abs(landmark.km - km))} km`,
      provenance: "measured",
      sample: false,
      source: landmark.source,
    });
  }

  const aid = story.aidStations.find((candidate) => candidate.km >= km);
  if (aid) {
    entries.push({
      kind: "aid",
      km: aid.km,
      title: `Aid station · organizer km ${aid.certifiedKm}`,
      detail: aid.offers.join(", "),
      provenance: "measured",
      sample: true,
    });
  }

  for (const note of story.notes) {
    if (Math.abs(note.km - km) > noteRangeKm) continue;
    entries.push({ kind: "note", km: note.km, title: note.kind, detail: note.text, provenance: "subjective", sample: true });
  }

  return entries.sort((a, b) => a.km - b.km);
}

/** The one-line statement of what a mockup is, so no one mistakes it for the finished app. */
export const SAMPLE_NOTICE =
  "Design mockup. Elevation, grade, difficulty and landmarks are real, measured data from the pipeline. " +
  "Sun exposure, wind, aid stations and runner reports are invented placeholders for pipelines that don't exist yet.";

export const UNOFFICIAL_NOTICE = "Unofficial — not affiliated with any race organizer.";
