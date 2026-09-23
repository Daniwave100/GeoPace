// Aid, as a layer: where the organizer's refreshment points are, what each one hands out, and how
// far it is to the next drink (issue #12, PLAN.md D47).
//
// **The row is the stations themselves, not a chart of them.** It was a sawtooth of "how far to
// the next water" for a day; the owner looked and said it plainly (09-21): *"the chart for water
// shouldn't be a bar or a line chart. It just doesn't look right. Just have like an indicator with
// the same images."* They are right, and the reason is the same one that made a station a point in
// the first place — a trace through fifteen stations draws the gaps between them, which is a line
// about what isn't there. So the row is one rule with a tick at each station and its own marks
// above it, and the marks are the ones on the map (core/serve-glyphs.ts): a drop, a bolt, a cross.
// How far the next water is has not gone: it is the row's own readout, where a number belongs.
//
// **A station is a sourced fact, not a measurement** (PLAN.md D19): it is what the organizer says
// will be there, which is the strongest claim anyone can make about a race that hasn't happened.
// It is drawn solid for that reason, and a station carried over from last year's list is greyed
// and says so, the way a carried-over wave time is (D38).
import type { CourseBundle } from "../bundle/types";
import { type AidStation, aidStations, nextServing, servesInWords, stationName } from "./aid";
import type { Clause, Layer, MarkLabel, RowValue, StripRow } from "./layers";
import { glyphsFor, SERVE_GLYPH, SHOWN_AS_GLYPHS } from "./serve-glyphs";
import type { Planner } from "./planner";
import { formatDistance, formatNearby, type Units } from "./units";

/** Above every hill label's priority: the label that stays when a chip and a hill collide is the chip. */
const CHIP_FIRST = 100;

/** Nearer than this and the sentence says the runner is at the station rather than counting down to it. */
const AT_IT_KM = 0.05;
/** What a reader who can't see the grey is told instead. Not a start time: a refreshment list. */
const LAST_YEARS_LIST = " (from an earlier edition's list of refreshment points)";

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
  // The row counts the run to the next *water*, so its reach is the longest stretch without water
  // — not the longest between stations. They are the same on a course where every station has
  // water, as Berlin's fifteen do, and they part the moment a list holds a gel depot between two
  // of them, which is exactly what New York's will (see its editions file).
  const furthestDryKm = furthestWithoutWater(stations, lengthKm);

  // The marks this course's stations use, each with its word, for the key in the row's header:
  // a shape nobody has learned is a guess (owner, 09-22).
  const used = SHOWN_AS_GLYPHS.filter((what) => stations.some((station) => station.serves.includes(what)));

  const row: StripRow = {
    id: "aid",
    name: "Stations",
    encoding: "measured",
    // What the value is: the header's room goes to the key of the marks, and the longest run
    // without water, which the scale used to say, is in "What the marks mean".
    scale: () => "to the next water",
    // A row of marks is asked for its marks, never for bins (strip/strip.ts).
    bins: () => [],
    domain: [0, 1],
    baseline: "bottom",
    stepped: false,
    valueAt: (km, units) => valueAt(km, stations, units),
    marks: (units) =>
      stations.map((station) => ({
        km: station.km,
        // Named in the runner's units, and by the organizer's own name too where the two differ:
        // the sign by the road says "Mile 3" whatever the switch says.
        label: `${stationName(station, units)}${units === station.markedIn ? "" : ` (${station.label})`}: ${servesInWords(station)}`,
        glyphs: glyphsFor(station.serves),
        encoding: "measured" as const,
      })),
    keyGlyphs: used.map((what) => SERVE_GLYPH[what]),
  };

  // The same note the sentence gives, so picking a station on the map says what standing on it
  // says: the brand, whose bottle can be waiting, and whether this is last year's list.
  const labels: MarkLabel[] = stations.map((station) => ({
    encoding: "measured",
    note: noteFor(station, carriedOver),
    atKm: station.km,
    startKm: station.km,
    glyphs: glyphsFor(station.serves),
    text: (units) => stationName(station, units),
    // The full stations first, so that where two crowd each other it is the one with more on it
    // that survives: a runner scanning the map is looking for a drink, not for a water table.
    // The chip is all a station has on the map — a hill still has its band — so a chip wins the
    // room from any hill's label (a hill's priority is its gain in metres; none is near a hundred).
    priority: CHIP_FIRST + station.serves.length,
    // Paper, framed in ink — the owner picked it over the ink block on 09-22 (D62).
    chip: true,
  }));

  return {
    id: "aid",
    name: "Aid",
    key: (units) =>
      `A chip on the line is a refreshment point, from the organizer's own list of ${stations.length}. Its marks are what it hands out: ${markNames(stations)}. The longest run without water is ${formatDistance(furthestDryKm, units, 1)}.`,
    rows: () => [row],
    // A station is a point, and its chip on the map is its mark: it paints nothing on the line,
    // which leaves the band to the hills and the rim to the shade (D62).
    lineMarks: () => [],
    lineLabels: () => labels,
    clause: (km, units) => clauseFor(km, stations, units, carriedOver),
  };
}

/** The longest stretch of road with no water on it: from the start, between stations, and to the finish. */
export function furthestWithoutWater(stations: AidStation[], lengthKm: number): number {
  const water = stations.filter((station) => station.serves.includes("water")).map((station) => station.km);
  return Math.max(...[...water, lengthKm].map((km, i) => km - (i === 0 ? 0 : [...water, lengthKm][i - 1])));
}

function valueAt(km: number, stations: AidStation[], units: Units): RowValue {
  // Standing on a station reads "here" either side of it, where the row's own value has already
  // jumped to the next one: the chart is a sawtooth and the words are about where you are. Short,
  // because the value shares the header's first line with the row's name, and the scale under it
  // says what the number is ("to the next water").
  const here = stations.some((station) => Math.abs(station.km - km) <= AT_IT_KM && station.serves.includes("water"));
  if (here) return { text: "here", notMeasured: null };
  const next = nextServing(stations, km, "water");
  // Never struck through: a carried-over station is last year's list, not an unmeasured value, and
  // the clause under the sentence is where the runner is told, with the reason.
  return { text: next ? formatNearby(next.km - km, units) : "none left", notMeasured: null };
}

function clauseFor(km: number, stations: AidStation[], units: Units, carriedOver: { from_edition: number; reason: string } | undefined): Clause | null {
  const here = stations.find((station) => Math.abs(station.km - km) <= AT_IT_KM);
  if (here) {
    return {
      text: `${capital(servesInWords(here))} here, at the ${stationName(here, units)} station.`,
      encoding: "measured",
      note: noteFor(here, carriedOver),
      carriedOver: here.carriedOver,
      carriedOverSaid: LAST_YEARS_LIST,
    };
  }
  const next = stations.find((station) => station.km > km);
  if (!next) return { text: "No more aid stations.", encoding: "measured" };
  return {
    text: `${capital(servesInWords(next))} in ${formatNearby(next.km - km, units)}, at ${stationName(next, units)}.`,
    encoding: "measured",
    note: noteFor(next, carriedOver),
    carriedOver: next.carriedOver,
    carriedOverSaid: LAST_YEARS_LIST,
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

/** The marks this course actually uses, named, because a shape nobody has learned is a guess. */
function markNames(stations: AidStation[]): string {
  const here = SHOWN_AS_GLYPHS.filter((what) => stations.some((station) => station.serves.includes(what)));
  const names = here.map((what) => SERVE_GLYPH[what].name.toLowerCase());
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
