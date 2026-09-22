// How a marked stretch of the course line is drawn on the map: how wide, and in what.
//
// A layer says which kind of claim a stretch is (core/encoding.ts), which slot of the line it is
// painted in (core/layers.ts: the band or the rim) and, where it has more to say than "here", how
// much and which way (`HowMuch`, -1 to 1: for Hills, how steep, negative coming down). This module
// turns that into a look, so no layer ever picks a colour for a claim of its own. (Aid's glyphs
// have colours, but those name things — water, a gel — not claims: core/serve-glyphs.ts, D62.)
//
// **The band** is the wide stripe outside the blue, and "how much" is its colour, the owner's
// picks by eye on 2026-09-18 (PLAN.md D47):
//   - against the runner (uphill) is warm: pale yellow, through orange, to deep red;
//   - with the runner (downhill) is teal: pale aqua, through teal, to deep teal. Teal and not light
//     blue, because blue is the course, and because water on the keyless map is light blue;
//   - it fades: the colour runs smoothly between those three stops, with no sudden change;
//   - both ways it gets darker as it gets deeper, never green against red (the pair one man in
//     twelve can't tell apart), so the scale still reads in a grey screenshot.
//
// **The rim** is the dark stripe hugging the blue, and it is what shade looks like on the map
// (D62): the road's own edge darkens where a building has it in shadow. Solid ink where a wall
// casts it, the poster's halftone — paper dots knocked out of the ink — where a tree does, and
// nothing at all in the sun, because the sun is the road's ordinary state and shade is the thing
// to mark. It is a different shape from the band, not a different colour, which is why the two can
// share a stretch without either being taken for the other; and it carries no "how much", because
// shade is binary (D58).
//
// Not measured here is either slot with the colour taken out: flat grey, the same width, the same
// hairline edge, no pattern. (It was grey dashes. Twice the owner took them for a fault in the
// drawing, "checkered boxes" and then "weird rectangles": blocks beside a line look like a glitch.
// Greying out is what "not measured" means everywhere else in the app.) Mid grey is the one tone a
// road in a photograph may match exactly, so a grey band never relies on the ground to be seen: it
// stands between its black hairline and the course's white edge.
//
// A dashed mark (a sample) carries its own ground (issue #22). Dashes laid straight onto the map
// are two different pictures: over dark imagery the dark dashes vanish and the paper-coloured gaps
// stand out as a row of white squares, and over a pale map it is the other way round. So the
// colour between the dashes is a band with a hairline edge, and the dashes are narrower than the
// band: it runs unbroken down both sides of them. A dash is then always seen against the band, and
// the band shows on any ground, by itself where the ground is dark and by its edge where it is pale.
import type { Encoding } from "./encoding";
import type { HowMuch } from "./layers";

/** One slot's look. Widths are per side of the line; an edge is a hairline drawn once, outside. */
export interface MarkLook {
  /** How wide the stripe is, on each side of the line. */
  widthPx: number;
  /** #rrggbb: the stripe, or the dashes where there are dashes. */
  color: string;
  /** The hairline outside it, so it reads on any ground. */
  edge: string;
  edgePx: number;
  /** Dashes, with this colour between them; null for a solid stripe. */
  gap: string | null;
  /** For a dashed stripe: how much of one dash-and-gap the dash itself takes. Half is a dash; a third reads as a dot. */
  dashShare: number;
  /** For a dashed stripe: how much of the colour between the dashes runs unbroken along each side of them, inside the edge. */
  dashInsetPx: number;
}

/** Both slots of one stretch. Either can be empty; both empty is the plain course. */
export interface RibbonLook {
  band: MarkLook | null;
  rim: MarkLook | null;
}

const INK = "#000000";
const PAPER = "#f4f4f0";
const GREY = "#8a8a86";

/** Pale, middle, deep. The strip fills its rows from the same two ramps. */
const WARM = ["#ffd84d", "#f07f1f", "#a3150f"];
const COOL = ["#a5e8dc", "#1fa698", "#0a5a55"];
/** The band, each side: wide enough to read beside the blue line. */
const BAND_PX = 5;
/** A dashed band is wider: the insets take room, and the dashes still have to show. */
const DASHED_BAND_PX = 7;
const DASH_INSET_PX = 2;
/** The rim, each side: a stripe, not a line, so it reads as the road's edge darkened. */
const RIM_PX = 4;
/** Every stripe ends in a hairline, so it reads on any ground. */
const EDGE_PX = 0.75;
/** Half of a dash-and-gap is a dash; a third of one is a dot. */
const DASH_SHARE = 0.5;
const DOT_SHARE = 0.34;

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

/** The band's look. `howMuch` where the layer says it; left out, a measured mark is plain ink. */
export function markLook(encoding: Encoding, howMuch?: HowMuch): MarkLook {
  const solid = (color: string, edge: string, edgePx = EDGE_PX): MarkLook => ({ widthPx: BAND_PX, color, edge, edgePx, gap: null, dashShare: DASH_SHARE, dashInsetPx: 0 });
  switch (encoding) {
    case "measured":
      return howMuch === undefined ? solid(INK, PAPER) : solid(rampColor(howMuch), INK);
    case "runner-report":
      return solid(PAPER, INK, 1.5);
    case "not-measured":
      return solid(GREY, INK);
    case "depends-on-leaves":
      // The same colour as the shade it is, with the paper dotted through it: `gap` is the stripe
      // the dots sit on, so the stripe is the colour and the dots are the paper.
      return { widthPx: DASHED_BAND_PX, color: PAPER, edge: INK, edgePx: EDGE_PX, gap: rampColor(howMuch ?? 0), dashShare: DOT_SHARE, dashInsetPx: DASH_INSET_PX };
    case "sample":
      return { widthPx: DASHED_BAND_PX, color: INK, edge: INK, edgePx: EDGE_PX, gap: PAPER, dashShare: DASH_SHARE, dashInsetPx: DASH_INSET_PX };
  }
}

/** The rim's look: shade, on the map. Ink where a wall casts it, paper dots in the ink where a tree does. */
export function rimLook(encoding: Encoding): MarkLook {
  const stripe = (color: string, gap: string | null = null, dashShare = DASH_SHARE): MarkLook => ({ widthPx: RIM_PX, color, edge: PAPER, edgePx: EDGE_PX, gap, dashShare, dashInsetPx: 0 });
  switch (encoding) {
    case "measured":
      return stripe(INK);
    case "depends-on-leaves":
      return stripe(PAPER, INK, DOT_SHARE);
    case "not-measured":
      return stripe(GREY);
    case "runner-report":
      return stripe(PAPER);
    case "sample":
      return stripe(INK, PAPER);
  }
}

/** The plain course between marks. */
export const PLAIN: RibbonLook = { band: null, rim: null };

export function sameLook(a: MarkLook | null, b: MarkLook | null): boolean {
  if (a === null || b === null) return a === b;
  return a.widthPx === b.widthPx && a.color === b.color && a.edge === b.edge && a.edgePx === b.edgePx && a.gap === b.gap && a.dashShare === b.dashShare && a.dashInsetPx === b.dashInsetPx;
}
