// One glyph as an element: an inline SVG the size of the text beside it, plus the word for it.
//
// The word is the point. A shape on its own is a guess for anybody who hasn't learned it, and a
// screen reader has nothing at all to say about a path — so every glyph carries its name in the
// element's title and in hidden text, and "What the marks mean" names each one (core/serve-glyphs.ts).
import type { Glyph } from "./core/serve-glyphs";
import { html } from "./dom";
import { svg } from "./svg";

/** The box every glyph is drawn in. */
const BOX = 16;

/**
 * `named` is whether the glyph carries its word in hidden text: yes where it stands for the thing
 * on its own (a chip on the map), no where the word is printed right beside it (the key sheet),
 * or a screen reader would hear "Water. Water".
 */
export function glyphNode(glyph: Glyph, className: string, named = true): HTMLElement {
  const drawing = svg("svg", { viewBox: `0 0 ${BOX} ${BOX}`, class: className, "aria-hidden": "true", focusable: "false" }, svg("path", { d: glyph.path, fill: glyph.color }));
  const node = html("span", { class: "glyph", title: glyph.name });
  node.append(drawing);
  if (named) node.append(html("span", { class: "visually-hidden", text: `${glyph.name}. ` }));
  return node;
}
