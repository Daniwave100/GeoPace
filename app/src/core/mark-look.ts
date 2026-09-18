// How a marked stretch of the course line is drawn on the map: how wide, and in what.
//
// ON TRIAL (PLAN.md §10). The owner asked for steepness to show at a glance and is choosing by eye
// between two looks for a hill, with a switch beside the layer switches:
//   A, "ink": black, and heavier the steeper it gets. Stays inside black, white and one blue (D28).
//   B, "colour": one width, in a warm colour that gets darker as well as redder. Never green:
//      red against green is the pair one man in twelve can't tell apart, and green for flat would
//      paint over the blue line for most of every course.
// Whichever wins stays, and the other, the switch and `hillLookFromUrl` go.
import type { Encoding } from "./encoding";
import type { MarkLevel } from "./layers";

export type HillLook = "ink" | "colour";

export const HILL_LOOKS: { id: HillLook; label: string; key: string }[] = [
  { id: "ink", label: "A · Ink weight", key: "A black edge on the blue line is a hill: the heavier, the steeper." },
  { id: "colour", label: "B · Colour", key: "A coloured edge on the blue line is a hill: pale is gentle, dark red is steep." },
];

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

const INK_WIDTHS_PX = [10, 16, 24];
/** Pale yellow, orange, deep red: each less than half as light as the one before. */
const WARM_RAMP = ["#ffd84d", "#f07f1f", "#a3150f"];
const ONE_WIDTH_PX = 16;

/** `level` is 1 to 3 where the layer says how much (how steep); left out, the mark is drawn at the middle weight. */
export function markLook(encoding: Encoding, level: Exclude<MarkLevel, 0> | undefined, hills: HillLook): MarkLook {
  switch (encoding) {
    case "measured":
      return hills === "ink"
        ? { widthPx: INK_WIDTHS_PX[(level ?? 2) - 1], color: INK, edge: PAPER, edgePx: 1, gap: null }
        : { widthPx: ONE_WIDTH_PX, color: WARM_RAMP[(level ?? 2) - 1], edge: INK, edgePx: 1.5, gap: null };
    case "runner-report":
      return { widthPx: ONE_WIDTH_PX, color: PAPER, edge: INK, edgePx: 3, gap: null };
    case "not-measured":
      return { widthPx: ONE_WIDTH_PX, color: GREY, edge: GREY, edgePx: 0, gap: PAPER };
    case "sample":
      return { widthPx: ONE_WIDTH_PX, color: INK, edge: INK, edgePx: 0, gap: PAPER };
  }
}

/** The look asked for in the page's address (`?hills=colour`), so a look can be reloaded and shown to someone. */
export function hillLookFromUrl(search: string): HillLook {
  return new URLSearchParams(search).get("hills") === "colour" ? "colour" : "ink";
}

/** How light a colour is, 0 black to 1 white, the way the eye weighs red, green and blue (WCAG). */
export function relativeLuminance(hex: string): number {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
