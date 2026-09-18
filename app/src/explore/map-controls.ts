// Moving the map without a mouse. The map is "moved freely like any maps app" (PLAN.md D34), and
// a maps app that only answers to dragging shuts out anyone on a keyboard. So: buttons to zoom and
// to see the whole course again, and, with the map focused, the arrow keys move it and + and -
// zoom. Dragging, scrolling and Ctrl + drag to tilt are CesiumJS's own and work as before.
import type { Viewer } from "cesium";
import { html } from "../dom";
import { panMap, zoomMap } from "../scene/globe";

/** Said by a screen reader on the map, and printed in the small print under the strip. */
export const MAP_HELP = "Drag to move, scroll to zoom, Ctrl + drag to tilt. With the keyboard: arrow keys move, plus and minus zoom.";

export function createMapControls(container: HTMLElement, map: HTMLElement, viewer: Viewer, onWholeCourse: () => void, onWhereIAm: () => void): void {
  const zoomIn = html("button", { type: "button", class: "button", "aria-label": "Zoom in", title: "Zoom in", text: "+" });
  const zoomOut = html("button", { type: "button", class: "button", "aria-label": "Zoom out", title: "Zoom out", text: "−" });
  const whole = html("button", { type: "button", class: "button map-whole", title: "Show the whole course", text: "Whole course" });
  // The map moves freely, so scrubbing can leave the runner off the edge of it: this brings them back.
  const whereIAm = html("button", { type: "button", class: "button map-whole", title: "Bring the map to where you are on the course", text: "Where I am" });
  whereIAm.addEventListener("click", onWhereIAm);
  zoomIn.addEventListener("click", () => zoomMap(viewer, 1));
  zoomOut.addEventListener("click", () => zoomMap(viewer, -1));
  whole.addEventListener("click", onWholeCourse);
  container.replaceChildren(zoomIn, zoomOut, whole, whereIAm);

  map.tabIndex = 0;
  map.setAttribute("role", "application");
  map.setAttribute("aria-label", `Map of the course. ${MAP_HELP}`);
  map.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target !== map) return;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (event.key in pan) panMap(viewer, ...pan[event.key]);
    else if (event.key === "+" || event.key === "=") zoomMap(viewer, 1);
    else if (event.key === "-" || event.key === "_") zoomMap(viewer, -1);
    else return;
    event.preventDefault(); // the arrows would otherwise scroll the page
  });
}
