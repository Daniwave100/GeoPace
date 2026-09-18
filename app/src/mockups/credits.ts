// The small print every mockup carries: what is real and what is a placeholder, that the project
// is unofficial, and who the data comes from. The words are fixed here; how they are set is up to
// each direction — but none of them gets to leave any of it out (PLAN.md §9).
import { SAMPLE_NOTICE, UNOFFICIAL_NOTICE } from "./content";
import type { CourseStory } from "./story";
import { html, link } from "./svg";

/**
 * Builds the credits with plain, prefixed class names (`<prefix>-credits__…`) for a design to
 * style. `commitment` is the design's own sentence about light and dark themes.
 */
export function buildCredits(story: CourseStory, prefix: string, commitment: string): HTMLElement {
  const name = (part: string) => `${prefix}-credits__${part}`;
  const root = html("footer", { class: `${prefix}-credits` });

  root.append(
    html("p", { class: name("unofficial"), text: UNOFFICIAL_NOTICE }),
    html("p", { class: name("sample"), text: SAMPLE_NOTICE }),
  );

  const layers = html("ul", { class: name("layers") });
  for (const layer of story.layers) {
    const kind = layer.provenance === "measured" ? "measured" : "reported by runners";
    const item = html("li", { class: name("layer"), "data-sample": layer.sample, "data-provenance": layer.provenance });
    item.append(html("b", { text: layer.label }), ` — ${kind}${layer.sample ? ", sample values" : ""}. `, noteWithLinks(layer.note));
    layers.append(item);
  }
  root.append(html("h2", { class: name("heading"), text: "What each layer is" }), layers);

  const credits = html("ul", { class: name("attributions") });
  for (const attribution of story.attributions) credits.append(html("li", {}, link(attribution.url, attribution.text)));
  root.append(html("h2", { class: name("heading"), text: "Data credits" }), credits);

  root.append(html("p", { class: name("commitment"), text: commitment }));
  return root;
}

/** Layer notes are "title — https://…"; make the URL a link rather than printing it raw. */
function noteWithLinks(note: string): Node {
  const match = note.match(/^(.*?)(?: — )?(https?:\/\/\S+)$/);
  if (!match) return document.createTextNode(note);
  return link(match[2], match[1] || match[2]);
}
