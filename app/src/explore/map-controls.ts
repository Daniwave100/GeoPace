// Moving the map without a mouse, and the map's own buttons. The map is "moved freely like any
// maps app" (PLAN.md D34), and a maps app that only answers to dragging shuts out anyone on a
// keyboard. So: buttons to zoom, to see the whole course, to come back to where the runner is, to
// look straight down like a paper map, and to give the map the whole screen; and, with the map
// focused, keys for the same things. Dragging, scrolling and Ctrl + drag to tilt are CesiumJS's own.
import type { Viewer } from "cesium";
import { html } from "../dom";
import { isLookingStraightDown, panMap, zoomMap } from "../scene/globe";

/** Said by a screen reader on the map, and printed in the small print under the strip. */
export const MAP_HELP = "Drag to move, scroll to zoom, Ctrl + drag to tilt. With the map focused: arrow keys move, + and − zoom, B looks straight down or tilts back, F gives the map the full screen.";

export interface MapActions {
  /**
   * Called before any of these buttons or keys moves the map: a Ride that is playing gives way to
   * it, free look included (issues #8, #28). Full map moves nothing, so it isn't one of them: the
   * Ride plays on.
   */
  takesTheMap(): void;
  wholeCourse(): void;
  whereIAm(): void;
  straightDown(): void;
  fullMap(): void;
}

export interface MapControls {
  /** Whether the map has the full screen, so the button can say how to get back. */
  showFullMap(on: boolean): void;
}

export function createMapControls(container: HTMLElement, map: HTMLElement, viewer: Viewer, actions: MapActions): MapControls {
  const button = (text: string, title: string, onPress: () => void, className = "button map-whole") => {
    const node = html("button", { type: "button", class: className, title, text });
    node.addEventListener("click", onPress);
    return node;
  };
  const moving = (move: () => void) => () => {
    actions.takesTheMap();
    move();
  };
  const zoomIn = button("+", "Zoom in", moving(() => zoomMap(viewer, 1)), "button");
  const zoomOut = button("−", "Zoom out", moving(() => zoomMap(viewer, -1)), "button");
  zoomIn.setAttribute("aria-label", "Zoom in");
  zoomOut.setAttribute("aria-label", "Zoom out");
  const whole = button("Whole course", "Show the whole course", moving(actions.wholeCourse));
  // The map moves freely, so scrubbing can leave the runner off the edge of it: this brings them back.
  const whereIAm = button("Where I am", "Bring the map to where you are on the course", moving(actions.whereIAm));
  const straightDown = button("Straight down", "Look straight down, north up, like a paper map (B)", moving(actions.straightDown));
  const fullMap = button("Full map", "Give the map the full screen (F)", actions.fullMap);
  fullMap.setAttribute("aria-pressed", "false");
  container.replaceChildren(zoomIn, zoomOut, whole, whereIAm, straightDown, fullMap);

  // The runner can tilt the map by hand too, so the button reads the camera rather than remembering.
  const showTilt = () => (straightDown.textContent = isLookingStraightDown(viewer) ? "Tilted" : "Straight down");
  viewer.camera.moveEnd.addEventListener(showTilt);
  showTilt();

  map.tabIndex = 0;
  map.setAttribute("role", "application");
  map.setAttribute("aria-label", `Map of the course. ${MAP_HELP}`);
  map.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target !== map) return;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (event.key in pan) moving(() => panMap(viewer, ...pan[event.key]))();
    else if (event.key === "+" || event.key === "=") moving(() => zoomMap(viewer, 1))();
    else if (event.key === "-" || event.key === "_") moving(() => zoomMap(viewer, -1))();
    else if (event.key === "b" || event.key === "B") moving(actions.straightDown)();
    else if (event.key === "f" || event.key === "F") actions.fullMap();
    else return;
    event.preventDefault(); // the arrows would otherwise scroll the page
  });

  return {
    showFullMap(on) {
      fullMap.textContent = on ? "Show the strip" : "Full map";
      fullMap.title = on ? "Bring back the readout, the strip and the credits (F)" : "Give the map the full screen (F)";
      fullMap.setAttribute("aria-pressed", String(on));
    },
  };
}
