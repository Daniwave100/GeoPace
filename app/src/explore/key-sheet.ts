// "What the marks mean": the key, one press away. It used to be a line under the strip whenever a
// layer was on, and the owner asked for the screen to open with the map and the charts and
// nothing else (09-22: "it shouldn't be there unless I click a button to see it"). So it is a
// sheet, like the race plan, and it holds everything a runner might want told once: what the
// blue line is, what each layer's marks are (Aid's, with the marks themselves drawn beside their
// words), how to read solid, grey and dotted, where this course's height is filled in and why,
// and how to move the map and the strip.
//
// It is built from the layers themselves (`Layer.key`, core/layers.ts), so a later layer is in
// the sheet by writing its key, and from the one encoding table (core/encoding.ts), so the words
// here and the marks on screen can't drift apart.
import type { CourseBundle } from "../bundle/types";
import { type Encoding, ENCODINGS } from "../core/encoding";
import type { Layer } from "../core/layers";
import { formatDistance, type Units } from "../core/units";
import { html } from "../dom";
import { glyphNode } from "../glyph-node";
import { MAP_HELP } from "./map-controls";

/** Said under the layer switches until the key moved here; what the strip answers to. */
export const STRIP_HELP = "Drag along the course, or use the arrow keys, to move where you are. Drag the strip's top edge, or use the up and down arrows on it, to resize the strip.";

/** The encodings worth explaining: the ones a layer draws today. Hearsay and samples wait for a layer that draws them. */
const ENCODINGS_IN_USE: Encoding[] = ["measured", "not-measured", "depends-on-leaves"];

export interface KeySheet {
  show(content: { bundle: CourseBundle; layers: Layer[]; units: Units }): void;
}

export function createKeySheet(container: HTMLElement): KeySheet {
  return {
    show({ bundle, layers, units }) {
      const gaps = bundle.measured.elevation_not_measured;
      container.replaceChildren(
        section("The course", [html("p", { text: "The blue line is the course. On the strip, the blue flag on it is where you are; on the map, the blue dot. A thin white edge is just the course. Blue never means anything else." })]),
        // Every layer this course has, on or off: a runner reads the key to decide what to switch on, too.
        ...layers.flatMap((layer) => {
          if (!layer.key) return [];
          const glyphs = layer.rows().flatMap((row) => row.keyGlyphs ?? []);
          return [
            section(layer.name, [
              html("p", { text: layer.key(units) }),
              ...(glyphs.length > 0 ? [html("ul", { class: "key-glyphs", "aria-label": `${layer.name}'s marks` }, ...glyphs.map((glyph) => html("li", {}, glyphNode(glyph, "key-glyph"), glyph.name)))] : []),
            ]),
          ];
        }),
        section(
          "Solid, grey, dotted",
          ENCODINGS_IN_USE.map((encoding) => html("p", {}, html("b", { text: `${ENCODINGS[encoding].name}. ` }), ENCODINGS[encoding].meaning)),
        ),
        // The reasons used to be printed under the sentence as the runner reached each stretch;
        // they are here instead, all of them at once, where they don't push the sentence off its block.
        ...(gaps.length > 0
          ? [
              section("Where the height is filled in, not measured", [
                html("p", { text: "On these stretches the survey has nothing, so the height is filled in. Everything worked out from it — the grade, the effort, the shade — is greyed there too." }),
                html("ul", { class: "key-list" }, ...gaps.map((gap) => html("li", {}, html("b", { text: `${formatDistance(gap.km_start, units)} to ${formatDistance(gap.km_end, units)}. ` }), gap.reason))),
              ]),
            ]
          : []),
        section("Moving the map", [html("p", { text: MAP_HELP })]),
        section("The strip", [html("p", { text: STRIP_HELP })]),
      );
    },
  };
}

function section(heading: string, body: HTMLElement[]): HTMLElement {
  return html("section", { class: "key-section" }, html("h3", { text: heading }), ...body);
}
