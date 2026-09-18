// The layer switches, along the top of the strip (PLAN.md D35). One layer on at a time: pressing
// a switch turns its layer on in place of whatever was on, and pressing it again turns it off.
// "Show everything" opens the full strip. Only layers that exist get a switch; nothing here
// advertises a layer that isn't built.
import type { Layer, LayerId, LayerState } from "../core/layers";
import { html } from "../dom";

export interface LayerBar {
  show(state: LayerState): void;
}

export function createLayerBar(container: HTMLElement, layers: Pick<Layer, "id" | "name">[], onLayer: (id: LayerId) => void, onEverything: () => void): LayerBar {
  const switches = layers.map((layer) => {
    const button = html("button", { type: "button", class: "switch", "aria-pressed": "false", text: layer.name });
    button.addEventListener("click", () => onLayer(layer.id));
    return { id: layer.id, button };
  });
  const everything = html("button", { type: "button", class: "switch", "aria-pressed": "false", "aria-controls": "strip", text: "Show everything" });
  everything.addEventListener("click", onEverything);

  container.replaceChildren(
    html("span", { class: "layer-bar-label", id: "layer-bar-label", text: "Show on the course" }),
    html("span", { role: "group", "aria-labelledby": "layer-bar-label", style: "display: contents" }, ...switches.map(({ button }) => button)),
    everything,
    html("span", { class: "layer-bar-help", text: "Drag along the course, or use the arrow keys, to move." }),
  );

  return {
    show(state) {
      for (const { id, button } of switches) button.setAttribute("aria-pressed", String(state.active === id));
      everything.setAttribute("aria-pressed", String(state.everything));
    },
  };
}
