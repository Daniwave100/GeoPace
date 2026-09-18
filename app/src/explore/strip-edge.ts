// The strip's top edge, which drags up and down to make the rows taller or to give the map the
// room. To a screen reader it is a separator with a value, which is what the platform calls a
// splitter; the arrow keys move it, Home and End take it to its ends, Enter puts it back. The
// arithmetic is in core/strip-size.ts, tested.
import { sizeAfterDrag, sizeAfterKey, STRIP_SIZE } from "../core/strip-size";

export interface StripEdge {
  show(size: number): void;
}

export interface StripEdgeOptions {
  /** How tall the strip's rows are at the designed size right now, in pixels (it depends on which rows are showing). */
  rowsHeightAtSizeOne(): number;
  /** Called while dragging and on each key press. */
  onSize(size: number): void;
  /** Called when a drag ends or a key is pressed: the moment to remember the size and let the map settle. */
  onDone(size: number): void;
}

export function createStripEdge(edge: HTMLElement, options: StripEdgeOptions): StripEdge {
  let size = STRIP_SIZE.designed;
  let drag: { fromY: number; sizeAtStart: number } | undefined;

  edge.tabIndex = 0;
  edge.setAttribute("role", "separator");
  edge.setAttribute("aria-orientation", "horizontal");
  edge.setAttribute("aria-label", "The strip's top edge: drag it, or use the up and down arrows, to resize the strip. Enter puts it back.");
  edge.setAttribute("aria-valuemin", String(Math.round(STRIP_SIZE.min * 100)));
  edge.setAttribute("aria-valuemax", String(Math.round(STRIP_SIZE.max * 100)));
  edge.title = "Drag to resize the strip. Double-click to put it back.";

  const use = (next: number) => {
    size = next;
    options.onSize(next);
  };
  edge.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    edge.setPointerCapture(event.pointerId);
    drag = { fromY: event.clientY, sizeAtStart: size };
    event.preventDefault(); // dragging the edge must not select the text under it
  });
  edge.addEventListener("pointermove", (event) => {
    if (!drag || !edge.hasPointerCapture(event.pointerId)) return;
    use(sizeAfterDrag({ sizeAtStart: drag.sizeAtStart, rowsHeightAtSizeOne: options.rowsHeightAtSizeOne(), draggedUpPx: drag.fromY - event.clientY }));
  });
  const endDrag = () => {
    if (!drag) return;
    drag = undefined;
    options.onDone(size);
  };
  edge.addEventListener("pointerup", endDrag);
  edge.addEventListener("pointercancel", endDrag);
  edge.addEventListener("dblclick", () => {
    use(STRIP_SIZE.designed);
    options.onDone(size);
  });
  edge.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = sizeAfterKey(event.key, size);
    if (next === null) return;
    event.preventDefault();
    use(next);
    options.onDone(size);
  });

  return {
    show(next) {
      size = next;
      edge.setAttribute("aria-valuenow", String(Math.round(next * 100)));
      edge.setAttribute("aria-valuetext", `${Math.round(next * 100)}% of its designed height`);
    },
  };
}
