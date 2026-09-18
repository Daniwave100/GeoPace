// The race clock: turns "my wave goes at 10:40 and I want to run 4 hours" into a position on the
// course, an elapsed time, and a time of day — in the course's own time zone, whatever time zone
// the computer running the browser happens to be in.
//
// Two distances are in play and they are not the same number (PLAN.md D20):
//   • the course line, measured along the actual route (Berlin 42.28 km, NYC 42.69 km)
//   • the certified distance, 42.195 km, measured along the shortest legal line
// A runner's goal time is a promise about crossing the finish line, so the goal is spread evenly
// over the course *line* — that is the ground they cover. The pace shown to them is the one they
// recognise from a training plan, which is the certified pace. Even pace is a v1 simplification
// (PLAN.md §7): real runners slow down, and grade-adjusted pacing is Tier 2.

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface RaceClockInput {
  /** Local calendar date of the race, YYYY-MM-DD. */
  date: string;
  /** IANA time zone of the course, e.g. "America/New_York". Never a fixed UTC offset. */
  timezone: string;
  /** Wall-clock time the wave starts, HH:MM, read off the organizer's schedule. */
  waveStartLocal: string;
  /** Target finish time, in seconds. */
  goalFinishSeconds: number;
  /** Length of the course line, in meters. */
  lineLengthM: number;
  /** The certified race distance, in meters — 42,195 for a marathon. */
  certifiedDistanceM: number;
}

export interface RaceClock {
  /** The absolute instant the wave crosses the start line. */
  startInstant: Date;
  /** Seconds per kilometre at the certified distance — the pace a runner trains to. */
  goalPaceSecondsPerKm: number;
  /** Length of the course line in km; scrubbing runs from 0 to here. */
  lineLengthKm: number;
  elapsedSecondsAtKm(km: number): number;
  kmAtElapsedSeconds(seconds: number): number;
  instantAtKm(km: number): Date;
  /** Time of day at that km, HH:MM in the course's zone. */
  localClockAtKm(km: number): string;
  /** What the course's zone is called at that moment: "CEST", "EST" — the DST switch, made visible. */
  zoneLabelAtKm(km: number): string;
}

export function raceClock(input: RaceClockInput): RaceClock {
  const startInstant = instantOfWallClock(`${input.date}T${input.waveStartLocal}`, input.timezone);
  const lineLengthKm = input.lineLengthM / 1000;
  const instantAtKm = (km: number) => new Date(startInstant.getTime() + elapsedSecondsAtKm(km) * 1000);

  function elapsedSecondsAtKm(km: number): number {
    return (input.goalFinishSeconds * clamp(km, 0, lineLengthKm)) / lineLengthKm;
  }

  return {
    startInstant,
    lineLengthKm,
    goalPaceSecondsPerKm: input.goalFinishSeconds / (input.certifiedDistanceM / 1000),
    elapsedSecondsAtKm,
    kmAtElapsedSeconds: (seconds) => (clamp(seconds, 0, input.goalFinishSeconds) / input.goalFinishSeconds) * lineLengthKm,
    instantAtKm,
    localClockAtKm: (km) => formatInZone(instantAtKm(km), input.timezone),
    zoneLabelAtKm: (km) => zoneLabel(instantAtKm(km), input.timezone),
  };
}

/** "1:23:45" for an hour-plus, "23:45" below that. Elapsed time, never a time of day. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** "5:41" — the way a runner writes a per-kilometre pace. */
export function formatPace(secondsPerKm: number): string {
  return formatElapsed(secondsPerKm);
}

/**
 * The instant at which the clock on the wall in `timeZone` reads `wall` (YYYY-MM-DDTHH:MM).
 *
 * There is no way to ask JavaScript this directly, so: read the wall time as if it were UTC, ask
 * what the zone's offset is around then, and subtract it. One correction settles the case where
 * that first guess landed on the other side of a daylight-saving change. In the hour a zone
 * repeats when clocks go back, two instants share a wall time; this returns the first.
 */
function instantOfWallClock(wall: string, timeZone: string): Date {
  if (!WALL_CLOCK.test(wall)) {
    throw new Error(`Race start "${wall}" is not a local date and time like 2026-11-01T10:40.`);
  }
  const asIfUtc = Date.parse(`${wall}:00Z`);
  const firstGuess = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/** How far ahead of UTC `timeZone` is at that instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = partsIn(timeZone, at);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

function formatInZone(at: Date, timeZone: string): string {
  const parts = partsIn(timeZone, at);
  return `${parts.hour}:${parts.minute}`;
}

function zoneLabel(at: Date, timeZone: string): string {
  const named = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName");
  return named?.value ?? timeZone;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(timeZone: string, at: Date): Record<string, string> {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
