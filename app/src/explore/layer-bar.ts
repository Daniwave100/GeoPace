// The layer switches, along the top of the strip (PLAN.md D35, D62). Each is a toggle, and any
// number can be on: pressing a switch turns its layer on beside whatever is on, and pressing it
// again turns it off. "Show everything" turns every layer on. Only layers that exist get a
// switch: the switches are made from the list of layers the course on screen has, so nothing
// advertises a layer that isn't built, and a new layer gets its switch by being added to that one
// list (main.ts).
import { everythingOn, isOn, type Layer, type LayerId, type LayerState } from "../core/layers";
import { html } from "../dom";

export interface LayerBar {
  show(state: LayerState, layers: Pick<Layer, "id" | "name">[]): void;
}

/** `onKey` opens "What the marks mean" (explore/key-sheet.ts): the one thing on the bar that isn't a switch. */
export function createLayerBar(container: HTMLElement, onLayer: (id: LayerId) => void, onEverything: () => void, onKey: () => void): LayerBar {
  let switches: { id: LayerId; button: HTMLButtonElement }[] = [];
  const group = html("div", { class: "layer-switches", role: "group", "aria-labelledby": "layer-bar-label" });
  const everything = html("button", { type: "button", class: "switch", "aria-pressed": "false", "aria-controls": "strip", text: "Show everything" });
  everything.addEventListener("click", onEverything);
  // Not a switch, and not drawn as one: a plain link-like button, so it can't be taken for a layer.
  const key = html("button", { type: "button", class: "link-button layer-bar-key", "aria-haspopup": "dialog", text: "What the marks mean" });
  key.addEventListener("click", onKey);

  container.replaceChildren(html("span", { class: "layer-bar-label", id: "layer-bar-label", text: "Show on the course" }), group, everything, key);

  return {
    show(state, layers) {
      // Rebuilt only when the list changes, so pressing a switch never takes the keyboard's focus off it.
      if (layers.map((layer) => layer.id).join() !== switches.map(({ id }) => id).join()) {
        switches = layers.map((layer) => {
          const button = html("button", { type: "button", class: "switch", text: layer.name });
          button.addEventListener("click", () => onLayer(layer.id));
          return { id: layer.id, button };
        });
        group.replaceChildren(...switches.map(({ button }) => button));
      }
      for (const { id, button } of switches) button.setAttribute("aria-pressed", String(isOn(state, id)));
      everything.setAttribute("aria-pressed", String(everythingOn(state, layers)));
    },
  };
}
