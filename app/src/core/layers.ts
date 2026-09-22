// The layer system (PLAN.md D35, D62). A layer is one kind of information about the course,
// switched on and off as a whole. When it is on it does three things and when it is off none of
// them: it marks the course line on the map, it adds its rows to the strip, and it adds its
// clause to the sentence. Any number can be on at once — the owner asked to see hills, shade and
// aid on the map together (09-22) — and the first screen still opens with none, which is what
// keeps it from being "a lot" (principle 8). "Show everything" turns them all on.
//
// Two layers marking the same stretch of the line can't both paint the same band beside it, so
// the line has two slots (D62): the **band**, wide and coloured, for how much and which way — a
// hill's steepness — and the **rim**, a dark stripe hugging the blue, for shade. One shader paints
// both on one line (scene/course-ribbon.ts), so nothing is ever laid over anything (D52).
//
// A layer is data, not drawing. It says what its rows, marks and clause are, and which kind of
// claim each one is (core/encoding.ts); the strip, the map and the sentence decide how that
// looks. So a later ticket adds a layer by writing one of these, and cannot restyle its way
// around the measured / runner-report split.
import type { Encoding } from "./encoding";
import type { Glyph } from "./serve-glyphs";
import type { Units } from "./units";

/** Every layer GeoPace will have (PLAN.md D35). The ones that exist are listed once, in `main.ts`. */
export type LayerId = "hills" | "shade" | "wind" | "aid" | "crowds" | "bottlenecks" | "watch-trouble";

export interface Layer {
  id: LayerId;
  /** The plain name on its switch: "Hills". */
  name: string;
  /** What its marks on the course line mean, in a sentence, for the key under the strip. */
  key?: string;
  /** Its rows on the strip, top to bottom. */
  rows(): StripRow[];
  /** How it marks the course line on the map: stretches of the line, each drawn as the kind of claim it is. */
  lineMarks(): LineMark[];
  /** The labels that go with those marks: one per thing marked, however many pieces its line is cut into. */
  lineLabels(): MarkLabel[];
  /** Its clause in the sentence where the runner is, or null when it has nothing to say there. */
  clause(km: number, units: Units): Clause | null;
}

/** One clause of the sentence: a short, complete statement ending in a full stop. */
export interface Clause {
  text: string;
  encoding: Encoding;
  /** More, for whoever asks: why a value is not measured here. */
  note?: string;
  /** true when it rests on something carried over from an earlier edition: greyed and flagged. */
  carriedOver?: boolean;
  /**
   * What a reader who can't see the grey is told instead. Left out, it is a start time, which is
   * what carrying over meant when only wave times could be: a layer that carries something else
   * over — Aid carries a whole list of refreshment points — says so in its own words.
   */
  carriedOverSaid?: string;
}

/** One slice of a row, as wide as the strip can draw. */
export interface RowBin {
  startKm: number;
  midKm: number;
  endKm: number;
  /** In the row's own metric unit; null where the row has no value (outside a model's range). */
  value: number | null;
  /**
   * The kind of claim this slice makes. Usually the row's own, but a row can be more than one:
   * a filled-in stretch is `not-measured` inside a measured row, and a stretch of shade a tree
   * casts is `depends-on-leaves` inside the same Shade row as the shade a wall casts.
   */
  encoding: Encoding;
}

/** A row of the strip: a thin trace with a light fill, a labelled scale, and the value under the cursor. */
export interface StripRow {
  id: string;
  name: string;
  encoding: Encoding;
  /** The labelled scale, in the runner's units: "m, 33 to 53". */
  scale(units: Units): string;
  /** One more line for the header, about the row as a whole: "up 262 m, down 293 m". */
  summary?(units: Units): string;
  /** The course cut into `binCount` slices. */
  bins(binCount: number): RowBin[];
  /** The values at the bottom and the top of the row. */
  domain: [number, number];
  /**
   * Where the fill hangs from: the bottom of the row, a value the row's scale has a place for
   * (0% grade, flat-ground effort), or `"middle"` — the axis a two-way row is drawn about when
   * there is no value there at all. A number is a value, so it is drawn as a line the runner can
   * read against; the middle of a binary row is not, and drawing it there put a dotted rule
   * through the Sun row that looked exactly like the app's own "not measured here".
   */
  baseline: "bottom" | "middle" | number;
  /** A stepped trace holds each bin's value flat; a smooth one joins bin to bin. */
  stepped: boolean;
  /** The value where the runner is, as it is printed in the row's header. */
  valueAt(km: number, units: Units): RowValue;
  /** For a row whose fill says how much as well as where: a `HowMuch` for each of `binCount` slices. */
  howMuch?(binCount: number): HowMuch[];
  /**
   * A row that is *things at places* rather than a value all the way along: aid stations, later
   * cheer zones. Where this is given the row draws these on one rule instead of a trace, and
   * `bins` is not asked for. A chart is the wrong shape for a point — a trace through fifteen
   * stations is a line about the gaps between them, not about the stations.
   */
  marks?(): RowMark[];
}

/** One thing at one place on a row: what it is, and the marks that say so. */
export interface RowMark {
  km: number;
  /** What it is, for the tooltip and for a reader who can't see the shapes. */
  label: string;
  glyphs: Glyph[];
  encoding: Encoding;
}

/**
 * How much, and which way, on a layer's own scale: for Hills, how steep. From -1 to 1. Positive is
 * against the runner (uphill) and drawn warm; negative is with them (downhill) and drawn cool;
 * the further from 0, the deeper the colour (core/mark-look.ts). 0 is not marked at all.
 */
export type HowMuch = number;

export interface RowValue {
  text: string;
  /** Why the value is not measured here, for the runner; null where it is. Printed grey and struck through. */
  notMeasured: string | null;
}

/**
 * Where on the course line a mark is painted. The band is the wide coloured stripe outside the
 * blue, for how much and which way (a hill); the rim is the dark stripe hugging the blue, for
 * shade. A layer paints one slot, so two layers can be on the line at once.
 */
export type LineSlot = "band" | "rim";

/** A stretch of the course line, marked on the map. */
export interface LineMark {
  fromKm: number;
  toKm: number;
  encoding: Encoding;
  /** Which slot it is painted in. Left out, the band. */
  slot?: LineSlot;
  /** Where the layer has more to say than "here": how steep a hill is, and which way. Never 0 on a mark. */
  howMuch?: HowMuch;
}

/** A label on the map for something a layer marks: a hill, later an aid station or a cheer zone. */
export interface MarkLabel {
  /**
   * Drawn as a chip — paper, framed in ink — rather than as the look of its claim: for a label that
   * names a point on the course instead of stating a value measured of it (D62). An aid station is
   * a place the organizer names, like the start and the finish, which have a look of their own too.
   */
  chip?: boolean;
  /** The kind of claim the label makes. */
  encoding: Encoding;
  /** More, for whoever asks: which part of it is not measured, and why. */
  note?: string;
  /** Where on the course the label sits. */
  atKm: number;
  /** Where the thing it names begins: picking the label takes the runner there. */
  startKm: number;
  text(units: Units): string;
  /**
   * Marks drawn beside the words, where the layer has a shape for what it is naming: an aid
   * station's water, bolt and cross (core/serve-glyphs.ts). Every one carries its own word, so a
   * label still says what it means to somebody who hasn't learned the shapes, or can't see them.
   */
  glyphs?: Glyph[];
  /** When labels would overprint each other, the higher priority stays. */
  priority: number;
}

/** Which switches are pressed. */
export interface LayerState {
  /** The layers that are on, in the order they were pressed. What they put on screen keeps the layers' own order. */
  on: LayerId[];
}

/** How the app opens: nothing on. The first screen shows little (PLAN.md principle 8). */
export const NO_LAYERS: LayerState = { on: [] };

/** Pressing a layer's switch turns it on beside whatever is on; pressing it again turns it off. */
export function pressLayer(state: LayerState, id: LayerId): LayerState {
  return { on: state.on.includes(id) ? state.on.filter((other) => other !== id) : [...state.on, id] };
}

/** "Show everything" turns every layer the course has on; pressed with all of them on, it turns them all off. */
export function pressEverything(state: LayerState, layers: Pick<Layer, "id">[]): LayerState {
  const all = layers.map((layer) => layer.id);
  return { on: all.every((id) => state.on.includes(id)) ? [] : all };
}

export function isOn(state: LayerState, id: LayerId): boolean {
  return state.on.includes(id);
}

export function everythingOn(state: LayerState, layers: Pick<Layer, "id">[]): boolean {
  return layers.length > 0 && layers.every((layer) => state.on.includes(layer.id));
}

export interface OnScreen {
  /** The layers that are on, in the layers' own order. */
  layers: Layer[];
  rows: StripRow[];
  lineMarks: LineMark[];
  lineLabels: MarkLabel[];
  /** Every on layer's clause where the runner is, in the layers' order, leaving out the ones with nothing to say. */
  clauses(km: number, units: Units): Clause[];
}

/** What the layers put on the strip, on the map and in the sentence, for these switches. */
export function onScreen(state: LayerState, layers: Layer[]): OnScreen {
  const on = layers.filter((layer) => state.on.includes(layer.id));
  return {
    layers: on,
    rows: on.flatMap((layer) => layer.rows()),
    lineMarks: on.flatMap((layer) => layer.lineMarks()),
    lineLabels: on.flatMap((layer) => layer.lineLabels()),
    clauses: (km, units) => on.map((layer) => layer.clause(km, units)).filter((clause): clause is Clause => clause !== null),
  };
}
