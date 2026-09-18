// The layer switches, along the top of the strip (PLAN.md D35). One layer on at a time: pressing
// a switch turns its layer on in place of whatever was on, and pressing it again turns it off.
// "Show everything" opens the full strip. Only layers that exist get a switch: the switches are
// made from the list of layers the course on screen has, so nothing advertises a layer that
// isn't built, and a new layer gets its switch by being added to that one list (main.ts).
import type { Layer, LayerId, LayerState } from "../core/layers";
import { html } from "../dom";

export interface LayerBar {
  show(state: LayerState, layers: Pick<Layer, "id" | "name">[]): void;
}

export function createLayerBar(container: HTMLElement, onLayer: (id: LayerId) => void, onEverything: () => void): LayerBar {
  let switches: { id: LayerId; button: HTMLButtonElement }[] = [];
  const group = html("div", { class: "layer-switches", role: "group", "aria-labelledby": "layer-bar-label" });
  const everything = html("button", { type: "button", class: "switch", "aria-pressed": "false", "aria-controls": "strip", text: "Show everything" });
  everything.addEventListener("click", onEverything);

  container.replaceChildren(
    html("span", { class: "layer-bar-label", id: "layer-bar-label", text: "Show on the course" }),
    group,
    everything,
    html("span", { class: "layer-bar-help", text: "Drag along the course, or use the arrow keys, to move. Drag the strip's top edge to resize it." }),
  );

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
      for (const { id, button } of switches) button.setAttribute("aria-pressed", String(state.active === id));
      everything.setAttribute("aria-pressed", String(state.everything));
    },
  };
}
