// One glyph as an element: an inline SVG the size of the text beside it, plus the word for it.
//
// The word is the point. A shape on its own is a guess for anybody who hasn't learned it, and a
// screen reader has nothing at all to say about a path — so every glyph carries its name in the
// element's title and in hidden text, and the key under the strip names each one (core/serve-glyphs.ts).
import type { Glyph } from "../core/serve-glyphs";
import { html } from "../dom";
import { svg } from "../svg";

/** The box every glyph is drawn in. */
const BOX = 16;

export function glyphNode(glyph: Glyph, className: string): HTMLElement {
  const drawing = svg("svg", { viewBox: `0 0 ${BOX} ${BOX}`, class: className, "aria-hidden": "true", focusable: "false" }, svg("path", { d: glyph.path }));
  const node = html("span", { class: "glyph", title: glyph.name });
  node.append(drawing, html("span", { class: "visually-hidden", text: `${glyph.name}. ` }));
  return node;
}
