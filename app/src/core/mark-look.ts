// How a marked stretch of the course line is drawn on the map: how wide, and in what.
//
// A layer says which kind of claim a stretch is (core/encoding.ts) and, where it has more to say
// than "here", how much: a level from 1 to 3 (for Hills, gentle, a proper hill, steep). This
// module turns that into a look, so no layer ever picks a colour of its own.
//
// "How much" is a warm colour that gets darker as well as redder: pale yellow, orange, deep red.
// The owner chose it by eye on 2026-09-18, over ink that got heavier, because it reads at a glance
// from far out (PLAN.md D47). It is never green: red against green is the pair one man in twelve
// can't tell apart, and each step is less than half as light as the one before, so the scale
// still reads in a grey screenshot. Blue stays what it was: the course, and where you are on it.
import type { Encoding } from "./encoding";
import type { MarkLevel } from "./layers";

export interface MarkLook {
  widthPx: number;
  /** #rrggbb */
  color: string;
  /** A hairline round it, so it reads on any ground. */
  edge: string;
  edgePx: number;
  /** Dashes, with this between them; null for a solid line. */
  gap: string | null;
}

const INK = "#000000";
const PAPER = "#f4f4f0";
const GREY = "#8a8a86";

/** Pale yellow, orange, deep red, by level. The strip draws the same steps in the same colours (style.css). */
export const LEVEL_COLORS: Record<Exclude<MarkLevel, 0>, string> = { 1: "#ffd84d", 2: "#f07f1f", 3: "#a3150f" };
/** Wide enough to show either side of the blue line. */
const WIDTH_PX = 16;

/** `level` is 1 to 3 where the layer says how much; left out, a measured mark is plain ink. */
export function markLook(encoding: Encoding, level?: Exclude<MarkLevel, 0>): MarkLook {
  switch (encoding) {
    case "measured":
      return level === undefined
        ? { widthPx: WIDTH_PX, color: INK, edge: PAPER, edgePx: 1, gap: null }
        : { widthPx: WIDTH_PX, color: LEVEL_COLORS[level], edge: INK, edgePx: 1.5, gap: null };
    case "runner-report":
      return { widthPx: WIDTH_PX, color: PAPER, edge: INK, edgePx: 3, gap: null };
    case "not-measured":
      return { widthPx: WIDTH_PX, color: GREY, edge: GREY, edgePx: 0, gap: PAPER };
    case "sample":
      return { widthPx: WIDTH_PX, color: INK, edge: INK, edgePx: 0, gap: PAPER };
  }
}
