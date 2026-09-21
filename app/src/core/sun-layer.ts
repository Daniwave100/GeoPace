// Sun, as a layer: sun or shade at the moment the runner gets there, and the stretches that have
// no shade at any hour (PLAN.md D58, issue #9).
//
// Binary, never a share. On the strip the Sun row is a square wave: up and warm where the sun is
// on the runner, down and teal where a building has them in shade. On the map the same thing
// marks the course line — and the shade itself is already there, cast by the White model's own
// blocks from the same buildings and the same clock, which is why the ticket asks that the two
// agree. The second row is the time-independent one the owner asked for: where the course is in
// the sun at *every* hour we model, which is the bridges and the wide avenues.
//
// What it rests on, and says out loud: a clear sky, the buildings only (trees are #10), and the
// road surface rather than a runner's head. Where the sun is under the floor the pipeline works
// shade out above, nothing was measured and the layer says so rather than filling in silently.
import type { CourseBundle } from "../bundle/types";
import type { Clause, HowMuch, Layer, LineMark, RowBin, RowValue, StripRow } from "./layers";
import type { Planner } from "./planner";
import { type SunAlong, sunAlong, type SunAt, type SunState } from "./sun";
import { formatNearby, type Units } from "./units";

/** How deep the warm and the teal are on a binary layer: one step, not a scale. */
const MARK: HowMuch = 0.8;
/** Closer than this to the end of the course, "the next 50 m" is really "to the finish". */
const AT_THE_FINISH_KM = 0.05;

/**
 * The Sun layer for this course and this runner's plan, or null where there is nothing to say:
 * a course with no building data, or a plan for an edition the table wasn't worked out for.
 * Only layers that exist get a switch (PLAN.md D47).
 */
export function sunLayer(bundle: CourseBundle, planner: Planner): Layer | null {
  const along = sunAlong(bundle, planner);
  if (!along) return null;
  const line = bundle.measured.course_line;
  const lengthKm = line.km[line.km.length - 1];
  const floorDeg = along.table.block.floor_deg;
  const binned = memoBins(line.km, lengthKm);
  // The hours the pipeline worked shade out for, for a runner who arrives outside them.
  const firstStep = new Date(along.table.firstStepMs);
  const lastStep = new Date(along.table.firstStepMs + (along.table.block.steps - 1) * along.table.stepMs);

  const sunRow: StripRow = {
    id: "sun",
    name: "Sun",
    encoding: "measured",
    scale: () => "sun above the line, shade below",
    // What every number here rests on, where the numbers are (issue #9: the clear-sky caveat).
    summary: () => "clear sky, buildings only",
    bins: (count) => binned(count).map((bin) => rowBin(bin, dominant(along.states, bin))),
    domain: [-1, 1],
    // The middle of this row is not a value: there is no zero between sun and shade.
    baseline: "middle",
    stepped: true,
    valueAt: (km) => sunValue(along.at(km), floorDeg),
    howMuch: (count) => binned(count).map((bin) => howMuch(dominant(along.states, bin))),
  };

  const allDayRow: StripRow = {
    id: "sun-all-day",
    name: "All-day sun",
    encoding: "measured",
    scale: () => "in the sun at every hour we model",
    bins: (count) => binned(count).map((bin) => neverShadedBin(bin, along)),
    domain: [0, 1],
    baseline: "bottom",
    stepped: true,
    valueAt: (km) => ({ text: along.at(km).alwaysInSun ? "Sun all day" : "Some shade", notMeasured: null }),
    howMuch: (count) => binned(count).map((bin) => (neverShadedBin(bin, along).value === 1 ? MARK : 0)),
  };

  // The sun being down is not a thing to mark: there is no sun on the runner and no building
  // keeping it off them, and the sentence says so in words.
  const marks: LineMark[] = along.runs
    .filter((run) => run.state !== "down")
    .map((run) => ({ fromKm: run.fromKm, toKm: run.toKm, encoding: run.state === "unknown" ? "not-measured" : "measured", howMuch: howMuch(run.state) || undefined }));

  return {
    id: "sun",
    name: "Sun",
    key: "Warm is the sun on you when you get there; teal is a building's shade. A clear sky is assumed, and trees are not in yet.",
    rows: () => [sunRow, allDayRow],
    lineMarks: () => marks,
    lineLabels: () => [],
    clause: (km, units) => clauseFor(along.at(km), km, lengthKm, units, floorDeg, planner.carriedOver !== null, { firstStep, lastStep, timezone: bundle.course.timezone }),
  };
}

/** The hours of race day the table covers, for saying so when a runner arrives outside them. */
interface ModelledHours {
  firstStep: Date;
  lastStep: Date;
  timezone: string;
}

function clauseFor(at: SunAt, km: number, lengthKm: number, units: Units, floorDeg: number, carriedOver: boolean, hours: ModelledHours): Clause | null {
  // The sentence's own last clause already says the sun is down; twice is not clearer.
  if (at.state === "down") return null;
  if (at.state === "unknown") {
    const tooLow = at.altitudeDeg < floorDeg;
    return {
      text: tooLow ? "The sun is too low to reach the street." : "Shade isn't worked out for this time of day.",
      encoding: "not-measured",
      note: tooLow
        ? `Under ${floorDeg}° the sun doesn't reach into a city street, so shade isn't worked out below that. It is ${Math.max(Math.round(at.altitudeDeg), 1)}° up where you are.`
        : `The shade was worked out for race day between ${clock(hours.firstStep, hours.timezone)} and ${clock(hours.lastStep, hours.timezone)}. You reach here outside that.`,
      carriedOver,
    };
  }
  // Where the road is never shaded at any hour, that is the more useful thing a planner can be
  // told, and it is the stretch of never-shaded road that is worth a distance, not this moment's.
  const text = at.alwaysInSun
    ? `No shade${howFar(at.alwaysUntilKm, km, lengthKm, units)}, at any hour.`
    : `In ${at.state === "sun" ? "the sun" : "shade"}${howFar(at.untilKm, km, lengthKm, units)}.`;
  return { text, encoding: "measured", carriedOver };
}

/** The value under the cursor, and why it is a filled-in one where it is. */
/**
 * " for the next 600 m", " to the finish", or nothing at all where the runner is already at the
 * end of the stretch: "in shade for the next 0 m" is not a sentence anyone should read.
 */
function howFar(untilKm: number, km: number, lengthKm: number, units: Units): string {
  if (untilKm >= lengthKm - AT_THE_FINISH_KM) return " to the finish";
  const ahead = formatNearby(untilKm - km, units);
  return ahead.startsWith("0 ") ? "" : ` for the next ${ahead}`;
}

function sunValue(at: SunAt, floorDeg: number): RowValue {
  if (at.state === "sun") return { text: "In the sun", notMeasured: null };
  if (at.state === "shade") return { text: "In shade", notMeasured: null };
  if (at.state === "down") return { text: "The sun is down", notMeasured: null };
  return at.altitudeDeg < floorDeg
    ? { text: "No direct sun", notMeasured: `The sun is under ${floorDeg}° here, too low to reach a city street, so shade isn't worked out.` }
    : { text: "Not worked out", notMeasured: "You reach here outside the hours of race day the shade was worked out for." };
}

function howMuch(state: SunState): HowMuch {
  return state === "sun" ? MARK : state === "shade" ? -MARK : 0;
}

/** One slice of the course, and which of its samples fall in it. */
interface SunBin {
  startKm: number;
  midKm: number;
  endKm: number;
  from: number;
  to: number;
}

function rowBin(bin: SunBin, state: SunState): RowBin {
  return { startKm: bin.startKm, midKm: bin.midKm, endKm: bin.endKm, value: state === "sun" ? 1 : -1, measured: state !== "unknown" };
}

/** A bin is drawn as the state most of it is in: the line and the map keep every 10 m of it. */
function dominant(states: SunState[], bin: SunBin): SunState {
  const counts = new Map<SunState, number>();
  for (let sample = bin.from; sample < bin.to; sample += 1) counts.set(states[sample], (counts.get(states[sample]) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** Never shaded, for a whole slice: only where every sample in it is in the sun at every hour. */
function neverShadedBin(bin: SunBin, along: SunAlong): RowBin {
  let all = true;
  for (let sample = bin.from; sample < bin.to; sample += 1) all &&= along.alwaysInSun[sample];
  return { startKm: bin.startKm, midKm: bin.midKm, endKm: bin.endKm, value: all ? 1 : 0, measured: true };
}

/** The strip redraws at the same width far more often than the width changes. */
function memoBins(km: number[], lengthKm: number): (count: number) => SunBin[] {
  let last: { count: number; bins: SunBin[] } | undefined;
  return (count) => {
    if (last?.count !== count) last = { count, bins: cutInto(km, lengthKm, count) };
    return last.bins;
  };
}

function cutInto(km: number[], lengthKm: number, count: number): SunBin[] {
  const width = lengthKm / count;
  const bins: SunBin[] = [];
  let sample = 0;
  for (let b = 0; b < count; b += 1) {
    const startKm = b * width;
    const endKm = b === count - 1 ? lengthKm : startKm + width;
    const from = sample;
    while (sample < km.length && km[sample] <= endKm) sample += 1;
    // A slice narrower than the samples are apart takes the one nearest its middle.
    bins.push({ startKm, midKm: (startKm + endKm) / 2, endKm, from: Math.min(from, km.length - 1), to: Math.max(sample, Math.min(from, km.length - 1) + 1) });
  }
  return bins;
}


/** A time of day on the course's own clock: the table's hours, in the words for a runner. */
function clock(when: Date, timezone: string): string {
  return when.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
}
