// One mark for each thing an aid station hands out, drawn the same wherever it appears: beside the
// course line on the map, and on the strip's Stations row (issue #12; the owner asked for icons on
// 2026-09-21, having looked at the words).
//
// They are single paths in a 16 x 16 box, flat with no outline, each in one colour of its own —
// the owner's ask (09-22): "if it's a blue water drop, maybe make the water drop blue… if it's a
// first aid station, maybe make it red… let's put some colour into it." One colour per thing, no
// shading, no gradient, which is still the poster's way with a mark (PLAN.md §6). Two rules kept:
// **water is aqua, never the course's blue**, because blue means the course and where you are on
// it and nothing else (D28), and a drop the colour of the line would say it was the line; and every
// colour reads at 3:1 or better on all three grounds it is drawn on — the light strip's paper, the
// dark theme's ground, and the black chip on the map — which is why the drop and the bolt are
// deeper than a first pick would make them (aid.test.ts checks it). These six are Aid's own, the
// one place a layer names a colour (D62): the encodings still come from core/encoding.ts.
//
// Every glyph carries the word for it too. An icon on its own is a guess for anybody who hasn't
// learned it, and a screen reader has nothing at all to say about a path — so the word goes in the
// label's title and in its hidden text, and the key under the strip names each one.
import type { Serves } from "./aid";

export interface Glyph {
  /** A path in a 16 x 16 box, filled, no stroke. */
  path: string;
  /** What it is, in the runner's words. */
  name: string;
  /** #rrggbb: the one colour it is drawn in, on the map and on the strip alike. */
  color: string;
}

/**
 * The things a station hands out that are worth a mark of their own, in the order a station's
 * marks read — the same order the words read in (core/aid.ts): what you drink, then the rest.
 * `refill` and `own-bottle` are conditions on the station rather than things served — they would double the marks on every
 * Berlin station to say something the note already says — so they have no glyph and no place here.
 */
export const SHOWN_AS_GLYPHS = ["water", "sports-drink", "tea", "gel", "fruit", "medical"] as const satisfies readonly Serves[];

export const SERVE_GLYPH: Record<(typeof SHOWN_AS_GLYPHS)[number], Glyph> = {
  // A drop: the one mark a runner will read without being told.
  water: { path: "M8 1.2C8 1.2 2.6 7.5 2.6 10.6a5.4 5.4 0 0 0 10.8 0C13.4 7.5 8 1.2 8 1.2Z", name: "Water", color: "#1789ab" },
  // A lightning bolt for the electrolyte drink — the owner's own suggestion, and the mark every
  // sports drink on a shelf already uses.
  "sports-drink": { path: "M9.6 0.8 3.2 9.1h3.6l-1 6.1 6.4-8.7H8.5l1.1-5.7Z", name: "Sports drink", color: "#b87400" },
  // A sachet: a packet with a torn top, which is what a gel is.
  gel: { path: "M4.1 3.4h7.8v9.3a1.3 1.3 0 0 1-1.3 1.3H5.4a1.3 1.3 0 0 1-1.3-1.3V3.4Zm-.4-1.8 1.4.9 1.4-.9 1.5.9 1.5-.9 1.4.9 1.4-.9v1.3H3.7V1.6Z", name: "Gel", color: "#7b7b75" },
  // A round fruit with a stalk and a leaf: bananas in New York, mixed fruit in Berlin.
  fruit: { path: "M8 4.2a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm.5-.9V1.4h-1v1.9h1Zm.6-.3c1.4-.2 2.4-1 2.6-2.2-1.4.1-2.4.9-2.6 2.2Z", name: "Fruit", color: "#2f8f3c" },
  // A cup with a handle and steam.
  tea: { path: "M2.9 6.3h8.4v4.2a2.8 2.8 0 0 1-2.8 2.8H5.7a2.8 2.8 0 0 1-2.8-2.8V6.3Zm8.4 1h1.4a1.8 1.8 0 0 1 0 3.6h-1.4v-1h1.4a.8.8 0 0 0 0-1.6h-1.4v-1ZM5.2 1.4c.8.8.8 1.5 0 2.3l.7.7c1.2-1.2 1.2-2.5 0-3.7l-.7.7Zm3 0c.8.8.8 1.5 0 2.3l.7.7c1.2-1.2 1.2-2.5 0-3.7l-.7.7Z", name: "Tea", color: "#a0622d" },
  // A red cross: the one mark whose colour everybody already knows.
  medical: { path: "M6.3 1.6h3.4v4.7h4.7v3.4H9.7v4.7H6.3V9.7H1.6V6.3h4.7V1.6Z", name: "Medical help", color: "#e03131" },
};

/** The marks for this station, in the order they read: what you drink first, then the rest. */
export function glyphsFor(serves: Serves[]): Glyph[] {
  return SHOWN_AS_GLYPHS.filter((what) => serves.includes(what)).map((what) => SERVE_GLYPH[what]);
}
