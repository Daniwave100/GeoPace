// The Planner: one runner's Race Plan, turned into answers. Given an edition, a wave and a goal,
// it says what time it is wherever the runner is, and where the runner is at any time. Pure logic,
// no rendering: the strip, the readout and the 3D scene all ask it the same questions, which is
// what keeps them moving together while scrubbing.
//
// It is built on the race clock (race-clock.ts), which owns the time-zone arithmetic. What the
// Planner adds is the edition facts: which waves exist, which of them have a published start
// time, and which times are carried over from an earlier edition and must be flagged. And the
// one thing that outranks them: the runner's own start time, read off their start card.
import type { CourseBundle, Edition, Wave } from "../bundle/types";
import { raceClock } from "./race-clock";
import { secondsPerKmFromPace, type Units } from "./units";

/** How close to a whole number of steps still counts as on it: floating point, not distance. */
const ON_THE_MARK = 1e-9;

/** What the runner is aiming for: a finish time, or the per-kilometre pace that implies one. */
export type Goal =
  | { kind: "finish"; seconds: number }
  /** Seconds per kilometre of the certified distance: the pace on a training plan. */
  | { kind: "pace"; secondsPerKm: number };

/** The runner's own choices. (Units and the fueling plan join it in later tickets.) */
export interface RacePlan {
  courseId: string;
  /** Which edition: the calendar year it is run in. */
  edition: number;
  waveId: string;
  /**
   * The start time the runner typed in themselves, HH:MM on the course's wall clock, or null to
   * use the wave's published one. It is the only way to plan with a wave whose time nobody has
   * published, and it outranks a published or carried-over time: the runner's own start card is
   * a better source for that runner than any schedule.
   */
  ownStartLocal: string | null;
  goal: Goal;
}

/** The part of a Course Bundle the Planner needs. */
export interface PlannerCourse {
  courseId: string;
  /** IANA time zone of the course. Every time of day the Planner gives is in this zone. */
  timezone: string;
  /** Length of the course line in meters: the app's one distance scale (PLAN.md D20). */
  lineLengthM: number;
  certifiedDistanceM: number;
  editions: Edition[];
}

/** Where and when the runner is. */
export interface Readout {
  /** Kilometres from the start along the course line, kept within the course. */
  km: number;
  elapsedSeconds: number;
  /** The exact moment, for anything that needs the sun: the 3D scene's clock, shade lookups. */
  instant: Date;
  /** Time of day in the course's zone, HH:MM, whatever zone the computer is in. */
  localClock: string;
  /** What the course's zone is called at that moment: "CEST", "EST". */
  zoneLabel: string;
}

/** Why a time can't be fully trusted: it rests on details copied from an earlier edition. */
export interface CarriedOver {
  fromEdition: number;
  /** In plain words, for the runner. */
  reason: string;
}

export interface Planner {
  plan: RacePlan;
  edition: Edition;
  wave: Wave;
  /** The start the clock runs from, HH:MM on the course's wall clock: the runner's own, else the wave's. */
  startLocal: string;
  /** true when `startLocal` is the runner's own rather than the wave's published time. */
  ownStartTime: boolean;
  /**
   * Set when the clock runs from a carried-over wave time, so every time of day (and the sun with
   * it) is last edition's. Whoever draws those times greys them and shows the reason; elapsed
   * time comes from the runner's own goal and is unaffected. null when the organizer has
   * confirmed the time, or the runner gave their own.
   */
  carriedOver: CarriedOver | null;
  /** Length of the course line in km; scrubbing runs from 0 to here. */
  lengthKm: number;
  /** The goal both ways round, whichever way the runner gave it. */
  goalFinishSeconds: number;
  goalPaceSecondsPerKm: number;
  /** The moment this runner's race starts. */
  startInstant: Date;
  at(km: number): Readout;
  /** The other direction: the km the runner has reached at that moment (0 before the start). */
  kmAtInstant(instant: Date): number;
  /**
   * The readout at every `stepKm` along the course line, and then at the finish. `splits(1)` is a
   * table of kilometres; `splits(1.609344)` is the same table in miles.
   */
  splits(stepKm: number): Readout[];
}

export function createPlanner(course: PlannerCourse, plan: RacePlan): Planner {
  const edition = course.editions.find((candidate) => candidate.edition === plan.edition);
  const wave = edition?.waves.find((candidate) => candidate.id === plan.waveId);
  const startLocal = plan.ownStartLocal ?? wave?.start_local ?? null;
  if (!edition || !wave || startLocal === null) {
    throw new Error(`No race clock for ${plan.courseId} ${plan.edition} ${plan.waveId}: pass the plan through sanitizePlan first.`);
  }
  const ownStartTime = plan.ownStartLocal !== null;
  const finishSeconds = goalFinishSeconds(plan.goal, course);
  const clock = raceClock({
    date: edition.date.day,
    timezone: course.timezone,
    waveStartLocal: startLocal,
    goalFinishSeconds: finishSeconds,
    lineLengthM: course.lineLengthM,
    certifiedDistanceM: course.certifiedDistanceM,
  });

  const at = (km: number): Readout => {
    const position = Math.min(Math.max(km, 0), clock.lineLengthKm);
    return {
      km: position,
      elapsedSeconds: clock.elapsedSecondsAtKm(position),
      instant: clock.instantAtKm(position),
      localClock: clock.localClockAtKm(position),
      zoneLabel: clock.zoneLabelAtKm(position),
    };
  };

  return {
    plan,
    edition,
    wave,
    startLocal,
    ownStartTime,
    carriedOver:
      !ownStartTime && wave.carried_over && edition.carried_over
        ? { fromEdition: edition.carried_over.from_edition, reason: edition.carried_over.reason }
        : null,
    lengthKm: clock.lineLengthKm,
    goalFinishSeconds: finishSeconds,
    goalPaceSecondsPerKm: clock.goalPaceSecondsPerKm,
    startInstant: clock.startInstant,
    kmAtInstant: (instant) => clock.kmAtElapsedSeconds((instant.getTime() - clock.startInstant.getTime()) / 1000),
    at,
    splits(stepKm) {
      // Marks are counted (1, 2, 3 steps), not added up, so a long table never drifts off them.
      const marks = Math.floor(clock.lineLengthKm / stepKm + ON_THE_MARK);
      const readouts = Array.from({ length: marks }, (_, i) => at((i + 1) * stepKm));
      const endsOnAMark = marks > 0 && clock.lineLengthKm - marks * stepKm < ON_THE_MARK * stepKm;
      return endsOnAMark ? readouts : [...readouts, at(clock.lineLengthKm)];
    },
  };
}

/** A pace is a promise about the certified distance, so that is what turns it into a finish time. */
export function goalFinishSeconds(goal: Goal, course: Pick<PlannerCourse, "certifiedDistanceM">): number {
  return goal.kind === "finish" ? goal.seconds : goal.secondsPerKm * (course.certifiedDistanceM / 1000);
}

export function plannerCourse(bundle: CourseBundle): PlannerCourse {
  return {
    courseId: bundle.course_id,
    timezone: bundle.course.timezone,
    lineLengthM: bundle.measured.course_line.length_m,
    certifiedDistanceM: bundle.course.certified_distance_m,
    editions: bundle.editions,
  };
}

// ---- The Race Plan itself: a starting point, what a runner types, and what storage hands back.

/** A round, common goal to start from. The runner changes it; it is never presented as advice. */
const DEFAULT_GOAL: Goal = { kind: "finish", seconds: 4 * 3600 };

/**
 * Finish times outside this range are typos, not goals: nobody has run a marathon in under two
 * hours in a race, and both courses close long before ten. Generous on purpose: it is a sanity
 * check, not a judgement.
 */
const FASTEST_FINISH_SECONDS = 1.5 * 3600;
const SLOWEST_FINISH_SECONDS = 10 * 3600;

const FINISH_TIME = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/; // h:mm or h:mm:ss
const PACE = /^(\d{1,2}):([0-5]\d)$/; // m:ss
const START_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/; // h:mm or hh:mm on a 24-hour clock

/** A wave whose start time is published: the wall-clock time and the instant it means. */
export type TimedWave = Wave & { start_local: string; start: string };

/** A wave can carry a plan only if its start time is published; otherwise there is no clock to run. */
export function hasStartTime(wave: Wave): wave is TimedWave {
  return wave.start_local !== null;
}

/** Where a new runner starts: the latest edition, its first wave with a published time. */
export function defaultPlan(course: PlannerCourse): RacePlan {
  const edition = latestEdition(course);
  return { courseId: course.courseId, edition: edition.edition, waveId: firstWaveWithStartTime(edition).id, ownStartLocal: null, goal: DEFAULT_GOAL };
}

/**
 * Makes anything into a plan the Planner can run, keeping every part that still makes sense.
 * What comes back from browser storage may be from an older version of the app, name a wave the
 * edition facts no longer list, or not be a plan at all.
 */
export function sanitizePlan(course: PlannerCourse, candidate: unknown): RacePlan {
  const remembered = (typeof candidate === "object" && candidate !== null ? candidate : {}) as Partial<Record<keyof RacePlan, unknown>>;
  const edition = course.editions.find((known) => known.edition === remembered.edition) ?? latestEdition(course);
  const ownStartLocal = typeof remembered.ownStartLocal === "string" ? parseStartTime(remembered.ownStartLocal) : null;
  // A wave can be planned with if it has a published start time, or the runner has given their own.
  const wave = edition.waves.find((known) => known.id === remembered.waveId && (hasStartTime(known) || ownStartLocal !== null)) ?? firstWaveWithStartTime(edition);
  return { courseId: course.courseId, edition: edition.edition, waveId: wave.id, ownStartLocal, goal: sanitizeGoal(remembered.goal, course) };
}

/**
 * What to remember when the runner types `startLocal` for `wave`: their own start time, or null
 * when it only repeats a time the organizer has confirmed. Repeating a carried-over time is not
 * nothing: it says the runner's start card agrees with last edition's, so it becomes their own.
 */
export function ownStartTimeFor(wave: Wave, startLocal: string): string | null {
  return hasStartTime(wave) && !wave.carried_over && wave.start_local === startLocal ? null : startLocal;
}

/** Reads "9:05" or "09:05" as a time of day and gives it back as "09:05". null if it isn't one. */
export function parseStartTime(text: string): string | null {
  const match = START_TIME.exec(text.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

/**
 * Reads "3:45" or "3:45:30" as a finish time, "5:20" as a pace. null if it isn't one. A pace is
 * typed per the unit the runner is shown (per km, or per mile) and kept per km, like everything
 * inside the app.
 */
export function parseGoal(kind: Goal["kind"], text: string, course: Pick<PlannerCourse, "certifiedDistanceM">, units: Units = "km"): Goal | null {
  const match = (kind === "finish" ? FINISH_TIME : PACE).exec(text.trim());
  if (!match) return null;
  const [first, second, third] = [match[1], match[2], match[3] ?? "0"].map(Number);
  const goal: Goal = kind === "finish" ? { kind, seconds: first * 3600 + second * 60 + third } : { kind, secondsPerKm: secondsPerKmFromPace(first * 60 + second, units) };
  return isPlausible(goal, course) ? goal : null;
}

/**
 * The same goal, written the other way: a finish time as a pace, or a pace as a finish time. The
 * pace is kept exact rather than rounded to the second a runner would read ("5:41"), because
 * rounding it and coming back turns 4:00:00 into 3:59:48. A finish time is whole seconds.
 */
export function goalWrittenAs(kind: Goal["kind"], goal: Goal, course: Pick<PlannerCourse, "certifiedDistanceM">): Goal {
  if (goal.kind === kind) return goal;
  const finish = goalFinishSeconds(goal, course);
  return kind === "finish" ? { kind, seconds: Math.round(finish) } : { kind, secondsPerKm: finish / (course.certifiedDistanceM / 1000) };
}

function sanitizeGoal(candidate: unknown, course: PlannerCourse): Goal {
  const goal = candidate as Partial<{ kind: unknown; seconds: unknown; secondsPerKm: unknown }> | null;
  if (goal?.kind === "finish" && typeof goal.seconds === "number") {
    const finish: Goal = { kind: "finish", seconds: goal.seconds };
    if (isPlausible(finish, course)) return finish;
  }
  if (goal?.kind === "pace" && typeof goal.secondsPerKm === "number") {
    const pace: Goal = { kind: "pace", secondsPerKm: goal.secondsPerKm };
    if (isPlausible(pace, course)) return pace;
  }
  return DEFAULT_GOAL;
}

function isPlausible(goal: Goal, course: Pick<PlannerCourse, "certifiedDistanceM">): boolean {
  const finish = goalFinishSeconds(goal, course);
  return Number.isFinite(finish) && finish >= FASTEST_FINISH_SECONDS && finish <= SLOWEST_FINISH_SECONDS;
}

function latestEdition(course: PlannerCourse): Edition {
  return course.editions.reduce((latest, edition) => (edition.edition > latest.edition ? edition : latest));
}

/** The Course Bundle contract guarantees every edition has one (the pipeline refuses it otherwise). */
function firstWaveWithStartTime(edition: Edition): Wave {
  const wave = edition.waves.find(hasStartTime);
  if (!wave) throw new Error(`Edition ${edition.edition} has no wave with a start time; the pipeline should have refused it.`);
  return wave;
}
