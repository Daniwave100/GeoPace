// Shade, as a layer: is the sun on this 10 m of road at the moment the runner reaches it, or is a
// building in the way? (PLAN.md D58, D59, issue #9.)
//
// Binary, never a share. On the strip it is one row, a square wave: up and warm where the sun is
// on the runner, down and teal where a building has them in shade. On the map the same thing
// marks the course line — and the shade itself is already there, cast by the White model's own
// blocks from the same buildings and the same clock, which is why the ticket asks that the two
// agree.
//
// What it rests on, and says out loud: a clear sky, the buildings only (trees are #10), and the
// road surface rather than a runner's head. Where the sun is under the floor the pipeline works
// shade out above, nothing was measured and the layer says so rather than filling in silently.
//
// The time-independent fact — stretches with no shade at any hour we model, which is the bridges
// and the wide avenues — had a row of its own for a day. The owner had it taken out (09-21: "just
// one sun chart is fine"): a row that is empty for 38 of Berlin's 42 km asks more of the screen
// than it gives back. It keeps its place in the sentence, which says it where it is true.
import type { CourseBundle, NotMeasuredSpan } from "../bundle/types";
import type { Clause, HowMuch, Layer, LineMark, RowBin, RowValue, StripRow } from "./layers";
import type { Planner } from "./planner";
import { sunAlong, type SunAt, type SunRun, type SunState } from "./sun";
import { formatNearby, type Units } from "./units";

/** How deep the warm and the teal are on a binary layer: one step, not a scale. */
const MARK: HowMuch = 0.8;
/** Closer than this to the end of the course, "the next 50 m" is really "to the finish". */
const AT_THE_FINISH_KM = 0.05;

/**
 * The Shade layer for this course and this runner's plan, or null where there is nothing to say:
 * a course with no building data, or a plan for an edition the table wasn't worked out for.
 * Only layers that exist get a switch (PLAN.md D47).
 */
export function shadeLayer(bundle: CourseBundle, planner: Planner): Layer | null {
  const along = sunAlong(bundle, planner);
  if (!along) return null;
  const line = bundle.measured.course_line;
  const lengthKm = line.km[line.km.length - 1];
  const floorDeg = along.table.block.floor_deg;
  const binned = memoBins(line.km, lengthKm);
  // The hours the pipeline worked shade out for, for a runner who arrives outside them.
  const firstStep = new Date(along.table.firstStepMs);
  const lastStep = new Date(along.table.firstStepMs + (along.table.block.steps - 1) * along.table.stepMs);

  // Where the road's own height was filled in rather than measured (a bridge deck the ground
  // model leaves out, a gap in a scan), so was the shade: the ray is cast from that height, and
  // at a 10-degree sun ten metres of height moves a block's reach by nearly sixty. Those
  // stretches are greyed here exactly as Hills greys them (PLAN.md D45, D47).
  const gaps = bundle.measured.elevation_not_measured;

  const row: StripRow = {
    id: "shade",
    name: "Shade",
    encoding: "measured",
    // The row has no numbers to scale, so its header says the thing that sets it apart instead:
    // this is the sun at the moment *you* pass, not at noon. Which side is which is in the key
    // under the strip, where there is room for it.
    scale: () => "when you get there",
    // What every number here rests on, where the numbers are (issue #9: the clear-sky caveat).
    summary: () => "clear sky, no trees",
    bins: (count) => binned(count).map((bin) => rowBin(bin, along.states, gaps)),
    domain: [-1, 1],
    // The middle of this row is not a value: there is no zero between sun and shade.
    baseline: "middle",
    stepped: true,
    valueAt: (km) => valueAt(along.at(km), floorDeg, filledIn(gaps, km)),
    howMuch: (count) => binned(count).map((bin) => (rowBin(bin, along.states, gaps).measured ? howMuch(dominant(along.states, bin)) : 0)),
  };

  // The sun being down is not a thing to mark: there is no sun on the runner and no building
  // keeping it off them, and the sentence says so in words. What is left is cut around the
  // stretches whose height is filled in, which are greyed whatever the sun is doing over them.
  const marks: LineMark[] = [
    ...along.runs
      .filter((run) => run.state !== "down")
      .flatMap((run) =>
        measuredParts(run, gaps).map(
          (part): LineMark => ({ fromKm: part.fromKm, toKm: part.toKm, encoding: run.state === "unknown" ? "not-measured" : "measured", howMuch: howMuch(run.state) || undefined }),
        ),
      ),
    ...gaps.map((gap): LineMark => ({ fromKm: gap.km_start, toKm: gap.km_end, encoding: "not-measured" })),
  ].sort((a, b) => a.fromKm - b.fromKm);

  return {
    id: "shade",
    name: "Shade",
    key: "Warm is the sun on you when you get there; teal is a building's shade. A clear sky is assumed, and trees are not in yet.",
    rows: () => [row],
    lineMarks: () => marks,
    lineLabels: () => [],
    clause: (km, units) => clauseFor(along.at(km), km, lengthKm, units, floorDeg, planner.carriedOver !== null, { firstStep, lastStep, timezone: bundle.course.timezone }, filledIn(gaps, km)),
  };
}

/** The hours of race day the table covers, for saying so when a runner arrives outside them. */
interface ModelledHours {
  firstStep: Date;
  lastStep: Date;
  timezone: string;
}

function clauseFor(at: SunAt, km: number, lengthKm: number, units: Units, floorDeg: number, carriedOver: boolean, hours: ModelledHours, gap: NotMeasuredSpan | undefined): Clause | null {
  // The sentence's own last clause already says the sun is down; twice is not clearer.
  if (at.state === "down") return null;
  if (at.state === "unknown") {
    const tooLow = at.altitudeDeg < floorDeg;
    return {
      text: tooLow ? "The sun is too low to reach the street." : "Shade isn't worked out for this time of day.",
      encoding: "not-measured",
      note: tooLow
        ? `Under ${floorDeg}° the sun doesn't reach into a city street, so shade isn't worked out below that. It is ${at.altitudeDeg.toFixed(1)}° up where you are.`
        : `The shade was worked out for race day between ${clock(hours.firstStep, hours.timezone)} and ${clock(hours.lastStep, hours.timezone)}. You reach here outside that.`,
      carriedOver,
    };
  }
  // Where the road is never shaded at any hour, that is the more useful thing a planner can be
  // told, and it is the stretch of never-shaded road that is worth a distance, not this moment's.
  const text = at.alwaysInSun
    ? `No shade${howFar(at.alwaysUntilKm, km, lengthKm, units)}, at any hour.`
    : `In ${at.state === "sun" ? "the sun" : "shade"}${howFar(at.untilKm, km, lengthKm, units)}.`;
  // The shade was worked out from the road's own height. Where that height is filled in, so is this.
  if (gap) return { text, encoding: "not-measured", note: `The shade here is worked out from a height that is filled in, not measured. ${gap.reason}`, carriedOver };
  return { text, encoding: "measured", carriedOver };
}

/**
 * " for the next 600 m", " to the finish", or nothing at all where the runner is already at the
 * end of the stretch: "in shade for the next 0 m" is not a sentence anyone should read.
 */
function howFar(untilKm: number, km: number, lengthKm: number, units: Units): string {
  if (untilKm >= lengthKm - AT_THE_FINISH_KM) return " to the finish";
  const ahead = formatNearby(untilKm - km, units);
  return ahead.startsWith("0 ") ? "" : ` for the next ${ahead}`;
}

/** The stretch of filled-in height the runner is standing on, if they are standing on one. */
function filledIn(gaps: NotMeasuredSpan[], km: number): NotMeasuredSpan | undefined {
  return gaps.find((gap) => km >= gap.km_start && km <= gap.km_end);
}

/** The parts of a run whose height is measured: the run, with every filled-in stretch cut out. */
function measuredParts(run: SunRun, gaps: NotMeasuredSpan[]): { fromKm: number; toKm: number }[] {
  const parts: { fromKm: number; toKm: number }[] = [];
  let reached = run.fromKm;
  for (const gap of gaps.filter((candidate) => candidate.km_start < run.toKm && candidate.km_end > run.fromKm)) {
    if (gap.km_start > reached) parts.push({ fromKm: reached, toKm: gap.km_start });
    reached = Math.max(reached, Math.min(gap.km_end, run.toKm));
  }
  if (reached < run.toKm) parts.push({ fromKm: reached, toKm: run.toKm });
  return parts;
}

/** The value under the cursor, and why it is a filled-in one where it is. */
function valueAt(at: SunAt, floorDeg: number, gap: NotMeasuredSpan | undefined): RowValue {
  if (at.state === "sun" || at.state === "shade") {
    const text = at.state === "sun" ? "In the sun" : "In shade";
    return { text, notMeasured: gap ? `The shade here is worked out from a height that is filled in, not measured. ${gap.reason}` : null };
  }
  if (at.state === "down") return { text: "The sun is down", notMeasured: null };
  return at.altitudeDeg < floorDeg
    ? { text: "No direct sun", notMeasured: `The sun is under ${floorDeg}° here, too low to reach a city street, so shade isn't worked out.` }
    : { text: "Not worked out", notMeasured: "You reach here outside the hours of race day the shade was worked out for." };
}

function howMuch(state: SunState): HowMuch {
  return state === "sun" ? MARK : state === "shade" ? -MARK : 0;
}

/** One slice of the course, and which of its samples fall in it. */
interface ShadeBin {
  startKm: number;
  midKm: number;
  endKm: number;
  from: number;
  to: number;
}

/**
 * One slice of the strip. Any part of it that isn't measured makes the whole slice not measured —
 * the any-overlap rule Hills uses, and the opposite of a majority vote, which would swallow up to
 * half a slice of filled-in or not-worked-out road into a solid, measured-looking run. A slice
 * with nothing to say at all — night, or hours outside the table — is a hole, not a value.
 */
function rowBin(bin: ShadeBin, states: SunState[], gaps: NotMeasuredSpan[]): RowBin {
  const inside = states.slice(bin.from, bin.to);
  const known = inside.filter((state) => state === "sun" || state === "shade");
  const sunlit = known.filter((state) => state === "sun").length;
  const filledIn = gaps.some((gap) => gap.km_start < bin.endKm && gap.km_end > bin.startKm);
  return {
    startKm: bin.startKm,
    midKm: bin.midKm,
    endKm: bin.endKm,
    value: known.length === 0 ? null : sunlit * 2 >= known.length ? 1 : -1,
    measured: !filledIn && !inside.some((state) => state === "unknown"),
  };
}

/** A bin is drawn as the state most of it is in: the line and the map keep every 10 m of it. */
function dominant(states: SunState[], bin: ShadeBin): SunState {
  const counts = new Map<SunState, number>();
  for (let sample = bin.from; sample < bin.to; sample += 1) counts.set(states[sample], (counts.get(states[sample]) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** The strip redraws at the same width far more often than the width changes. */
function memoBins(km: number[], lengthKm: number): (count: number) => ShadeBin[] {
  let last: { count: number; bins: ShadeBin[] } | undefined;
  return (count) => {
    if (last?.count !== count) last = { count, bins: cutInto(km, lengthKm, count) };
    return last.bins;
  };
}

function cutInto(km: number[], lengthKm: number, count: number): ShadeBin[] {
  const width = lengthKm / count;
  const bins: ShadeBin[] = [];
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
