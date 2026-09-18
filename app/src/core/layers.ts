// The layer system (PLAN.md D35). A layer is one kind of information about the course, switched
// on and off as a whole. When it is on it does three things and when it is off none of them: it
// marks the course line on the map, it adds its rows to the strip, and it adds its clause to the
// sentence. One layer is on at a time, which is what keeps the first screen from becoming "a
// lot" again; "Show everything" opens the full strip for the people who want all of it.
//
// A layer is data, not drawing. It says what its rows, marks and clause are, and which kind of
// claim each one is (core/encoding.ts); the strip, the map and the sentence decide how that
// looks. So a later ticket adds a layer by writing one of these, and cannot restyle its way
// around the measured / runner-report split.
import type { Encoding } from "./encoding";
import type { Units } from "./units";

/** Every layer GeoPace will have (PLAN.md D35). The ones that exist are listed once, in `main.ts`. */
export type LayerId = "hills" | "sun" | "wind" | "aid" | "crowds" | "bottlenecks" | "watch-trouble";

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
  /** true when it rests on a start time carried over from an earlier edition: greyed and flagged. */
  carriedOver?: boolean;
}

/** One slice of a row, as wide as the strip can draw. */
export interface RowBin {
  startKm: number;
  midKm: number;
  endKm: number;
  /** In the row's own metric unit; null where the row has no value (outside a model's range). */
  value: number | null;
  /** false where the value is filled in rather than measured. */
  measured: boolean;
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
  /** Where the fill hangs from: the bottom of the row, or a value (0% grade, flat-ground effort). */
  baseline: "bottom" | number;
  /** A stepped trace holds each bin's value flat; a smooth one joins bin to bin. */
  stepped: boolean;
  /** The value where the runner is, as it is printed in the row's header. */
  valueAt(km: number, units: Units): RowValue;
  /** For a row whose fill says how much as well as where: a `HowMuch` for each of `binCount` slices. */
  howMuch?(binCount: number): HowMuch[];
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

/** A stretch of the course line, marked on the map. */
export interface LineMark {
  fromKm: number;
  toKm: number;
  encoding: Encoding;
  /** Where the layer has more to say than "here": how steep a hill is, and which way. Never 0 on a mark. */
  howMuch?: HowMuch;
}

/** A label on the map for something a layer marks: a hill, later an aid station or a cheer zone. */
export interface MarkLabel {
  /** The kind of claim the label makes. */
  encoding: Encoding;
  /** More, for whoever asks: which part of it is not measured, and why. */
  note?: string;
  /** Where on the course the label sits. */
  atKm: number;
  /** Where the thing it names begins: picking the label takes the runner there. */
  startKm: number;
  text(units: Units): string;
  /** When labels would overprint each other, the higher priority stays. */
  priority: number;
}

/** Which switches are pressed. */
export interface LayerState {
  /** The one layer that is on, or null. */
  active: LayerId | null;
  /** "Show everything": the strip shows every layer's rows, whichever layer is on. */
  everything: boolean;
}

/** How the app opens: nothing on. The first screen shows little (PLAN.md principle 8). */
export const NO_LAYERS: LayerState = { active: null, everything: false };

/** Pressing a layer's switch turns it on in place of whatever was on; pressing it again turns it off. */
export function pressLayer(state: LayerState, id: LayerId): LayerState {
  return { ...state, active: state.active === id ? null : id };
}

export function pressEverything(state: LayerState): LayerState {
  return { ...state, everything: !state.everything };
}

export interface OnScreen {
  rows: StripRow[];
  lineMarks: LineMark[];
  lineLabels: MarkLabel[];
  clause(km: number, units: Units): Clause | null;
}

/** What the layers put on the strip, on the map and in the sentence, for these switches. */
export function onScreen(state: LayerState, layers: Layer[]): OnScreen {
  const active = layers.find((layer) => layer.id === state.active);
  const onStrip = state.everything ? layers : active ? [active] : [];
  return {
    rows: onStrip.flatMap((layer) => layer.rows()),
    lineMarks: active ? active.lineMarks() : [],
    lineLabels: active ? active.lineLabels() : [],
    clause: (km, units) => active?.clause(km, units) ?? null,
  };
}
