// Aid, as a layer: where the organizer's refreshment points are, what each one hands out, and how
// far it is to the next drink (issue #12, PLAN.md D47).
//
// The row is **how far to the next water**, not "is there a station here". A station is a point
// and a slice of the strip is ninety metres of road, so a row of points would be a row of gaps;
// what a runner actually wants off a chart is the shape of the thirst — a sawtooth that climbs
// through every dry stretch and drops to nothing at each station. The stations themselves are on
// the course line, where a point belongs, with their own labels.
//
// **A station is a sourced fact, not a measurement** (PLAN.md D19): it is what the organizer says
// will be there, which is the strongest claim anyone can make about a race that hasn't happened.
// It is drawn solid for that reason, and a station carried over from last year's list is greyed
// and says so, the way a carried-over wave time is (D38).
import type { CourseBundle } from "../bundle/types";
import { type AidStation, aidStations, nextServing, servesInWords } from "./aid";
import type { Clause, Layer, LineMark, MarkLabel, RowBin, RowValue, StripRow } from "./layers";
import type { Planner } from "./planner";
import { formatDistance, formatNearby, type Units } from "./units";

/** How much course a station's mark covers, either side: enough to see, short enough to be a point. */
const MARK_REACH_KM = 0.04;
/** Nearer than this and the sentence says the runner is at the station rather than counting down to it. */
const AT_IT_KM = 0.05;

/**
 * The Aid layer for this course and edition, or null where the edition has no published station
 * list — New York's, at the time of writing (see its editions file). Only layers that exist get a
 * switch (PLAN.md D47), so a course with no list simply has no Aid.
 */
export function aidLayer(bundle: CourseBundle, planner: Planner): Layer | null {
  const stations = aidStations(planner.edition);
  if (stations.length === 0) return null;
  const line = bundle.measured.course_line;
  const lengthKm = line.km[line.km.length - 1];
  const carriedOver = stations.some((station) => station.carriedOver) ? planner.edition.carried_over : undefined;
  const furthestDryKm = Math.max(...stations.map((station, i) => station.km - (i === 0 ? 0 : stations[i - 1].km)), lengthKm - stations[stations.length - 1].km);

  const row: StripRow = {
    id: "aid",
    name: "To the next water",
    encoding: "measured",
    scale: (units) => `${formatDistance(0, units, 0)} to ${formatDistance(furthestDryKm, units, 1)}`,
    summary: () => `${stations.length} stations, the organizer's own list`,
    bins: (count) => cutInto(lengthKm, count).map((bin) => rowBin(bin, stations, lengthKm)),
    domain: [0, furthestDryKm],
    baseline: "bottom",
    stepped: false,
    valueAt: (km, units) => valueAt(km, stations, units),
  };

  const marks: LineMark[] = stations.map((station) => ({
    fromKm: Math.max(0, station.km - MARK_REACH_KM),
    toKm: Math.min(lengthKm, station.km + MARK_REACH_KM),
    encoding: "measured",
  }));

  const labels: MarkLabel[] = stations.map((station) => ({
    encoding: "measured",
    note: station.carriedOver && carriedOver ? `${carriedOver.reason} This station is ${carriedOver.from_edition}'s.` : station.note,
    atKm: station.km,
    startKm: station.km,
    text: () => `${station.label}: ${servesInWords(station)}`,
    // The full stations first, so that where two crowd each other it is the one with more on it
    // that survives: a runner scanning the map is looking for a drink, not for a water table.
    priority: station.serves.length,
  }));

  return {
    id: "aid",
    name: "Aid",
    key: `Ink on the line is a refreshment point, from ${stations[0].source.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}'s own list. The chart is how far you still have to run for water.`,
    rows: () => [row],
    lineMarks: () => marks,
    lineLabels: () => labels,
    clause: (km, units) => clauseFor(km, stations, units, carriedOver),
  };
}

/** One slice of the course, for the row. */
interface AidBin {
  startKm: number;
  midKm: number;
  endKm: number;
}

function rowBin(bin: AidBin, stations: AidStation[], lengthKm: number): RowBin {
  return { startKm: bin.startKm, midKm: bin.midKm, endKm: bin.endKm, value: toNextWaterKm(bin.midKm, stations, lengthKm), encoding: "measured" };
}

/**
 * How far from here to the next water, in km. Past the last water station it is the distance to
 * the finish: the thirst keeps climbing, because there is nothing else coming.
 */
export function toNextWaterKm(km: number, stations: AidStation[], lengthKm: number): number {
  const next = nextServing(stations, km, "water");
  return Math.max(0, (next ? next.km : lengthKm) - km);
}

function valueAt(km: number, stations: AidStation[], units: Units): RowValue {
  // Standing on a station reads "water here" either side of it, where the row's own value has
  // already jumped to the next one: the chart is a sawtooth and the words are about where you are.
  const here = stations.some((station) => Math.abs(station.km - km) <= AT_IT_KM && station.serves.includes("water"));
  if (here) return { text: "water here", notMeasured: null };
  const next = nextServing(stations, km, "water");
  // Never struck through: a carried-over station is last year's list, not an unmeasured value, and
  // the clause under the sentence is where the runner is told, with the reason.
  return { text: next ? formatNearby(next.km - km, units) : "no more water", notMeasured: null };
}

function clauseFor(km: number, stations: AidStation[], units: Units, carriedOver: { from_edition: number; reason: string } | undefined): Clause | null {
  const here = stations.find((station) => Math.abs(station.km - km) <= AT_IT_KM);
  if (here) {
    return {
      text: `${capital(servesInWords(here))} here, at the ${here.label} station.`,
      encoding: "measured",
      note: noteFor(here, carriedOver),
      carriedOver: here.carriedOver,
    };
  }
  const next = stations.find((station) => station.km > km);
  if (!next) return { text: "No more aid stations.", encoding: "measured" };
  return {
    text: `${capital(servesInWords(next))} in ${formatNearby(next.km - km, units)}, at ${next.label}.`,
    encoding: "measured",
    note: noteFor(next, carriedOver),
    carriedOver: next.carriedOver,
  };
}

function noteFor(station: AidStation, carriedOver: { from_edition: number; reason: string } | undefined): string | undefined {
  const parts = [station.detail, station.note];
  if (station.carriedOver && carriedOver) parts.push(`This is ${carriedOver.from_edition}'s list. ${carriedOver.reason}`);
  if (station.serves.includes("own-bottle")) parts.push("Your own bottle can be waiting here, handed in before the start.");
  else if (station.serves.includes("refill")) parts.push("Your own bottle or pack can be topped up here.");
  const note = parts.filter(Boolean).join(" ");
  return note === "" ? undefined : note;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cutInto(lengthKm: number, count: number): AidBin[] {
  const width = lengthKm / count;
  return Array.from({ length: count }, (_, b) => {
    const startKm = b * width;
    const endKm = b === count - 1 ? lengthKm : startKm + width;
    return { startKm, midKm: (startKm + endKm) / 2, endKm };
  });
}
