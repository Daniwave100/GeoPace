// How a marked stretch of the course line is drawn on the map: how wide, and in what.
//
// A layer says which kind of claim a stretch is (core/encoding.ts) and, where it has more to say
// than "here", how much and which way (`HowMuch`, -1 to 1: for Hills, how steep, negative coming
// down). This module turns that into a look, so no layer ever picks a colour of its own.
//
// "How much" is colour, the owner's picks by eye on 2026-09-18 (PLAN.md D47):
//   - against the runner (uphill) is warm: pale yellow, through orange, to deep red;
//   - with the runner (downhill) is teal: pale aqua, through teal, to deep teal. Teal and not light
//     blue, because blue is the course, and because water on the keyless map is light blue;
//   - it fades: the colour runs smoothly between those three stops, with no sudden change;
//   - both ways it gets darker as it gets deeper, never green against red (the pair one man in
//     twelve can't tell apart), so the scale still reads in a grey screenshot.
//
// A dashed mark (not measured here; a sample) carries its own ground (issue #22). Dashes laid
// straight onto the map are two different pictures: over dark imagery the grey dashes vanished and
// the paper-coloured gaps stood out as a row of white squares, and over the pale keyless map it
// was the other way round. So the colour between the dashes is a band with a hairline edge, and
// the dashes are narrower than the band: it runs unbroken down both sides of them. A dash is then
// always seen against the band, and the band shows on any ground, by itself where the ground is
// dark and by its edge where it is pale.
import type { Encoding } from "./encoding";
import type { HowMuch } from "./layers";

export interface MarkLook {
  widthPx: number;
  /** #rrggbb */
  color: string;
  /** A hairline round it, so it reads on any ground. */
  edge: string;
  edgePx: number;
  /** Dashes, with this between them; null for a solid line. */
  gap: string | null;
  /** For a dashed mark: how much of the colour between the dashes runs unbroken along each side of them, inside the edge. */
  rimPx: number;
}

const INK = "#000000";
const PAPER = "#f4f4f0";
const GREY = "#8a8a86";

/** Pale, middle, deep. The strip fills its rows from the same two ramps. */
const WARM = ["#ffd84d", "#f07f1f", "#a3150f"];
const COOL = ["#a5e8dc", "#1fa698", "#0a5a55"];
/** Wide enough to show either side of the blue line. */
const WIDTH_PX = 16;
/** A dashed mark is wider: the rims take room, and the dashes still have to show either side of the blue line. */
const DASHED_WIDTH_PX = 20;
const RIM_PX = 2;

/** The colour for how much: warm above 0, teal below, pale near 0 and deep at 1, fading between. */
export function rampColor(howMuch: HowMuch): string {
  const stops = howMuch < 0 ? COOL : WARM;
  const along = Math.min(Math.abs(howMuch), 1) * (stops.length - 1);
  const from = Math.min(Math.floor(along), stops.length - 2);
  return mix(stops[from], stops[from + 1], along - from);
}

function mix(from: string, to: string, share: number): string {
  const channel = (at: number) => {
    const [a, b] = [parseInt(from.slice(at, at + 2), 16), parseInt(to.slice(at, at + 2), 16)];
    return Math.round(a + (b - a) * share).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** `howMuch` where the layer says it; left out, a measured mark is plain ink. */
export function markLook(encoding: Encoding, howMuch?: HowMuch): MarkLook {
  switch (encoding) {
    case "measured":
      return howMuch === undefined
        ? { widthPx: WIDTH_PX, color: INK, edge: PAPER, edgePx: 1, gap: null, rimPx: 0 }
        : { widthPx: WIDTH_PX, color: rampColor(howMuch), edge: INK, edgePx: 1.5, gap: null, rimPx: 0 };
    case "runner-report":
      return { widthPx: WIDTH_PX, color: PAPER, edge: INK, edgePx: 3, gap: null, rimPx: 0 };
    case "not-measured":
      return { widthPx: DASHED_WIDTH_PX, color: GREY, edge: INK, edgePx: 1.5, gap: PAPER, rimPx: RIM_PX };
    case "sample":
      return { widthPx: DASHED_WIDTH_PX, color: INK, edge: INK, edgePx: 1.5, gap: PAPER, rimPx: RIM_PX };
  }
}
