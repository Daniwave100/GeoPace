// SVG helpers, next to the HTML ones (dom.ts). Shared by the app's strip and the design mockups.
import { applyAttrs, type Attrs } from "./dom";

export { html, link } from "./dom";

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  node.append(...children);
  return node;
}

/** An SVG polygon's `points` attribute from a list of coordinates. */
export function points(list: { x: number; y: number }[]): string {
  return list.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Draw something sized to its container, and draw it again when the container changes size. The
 * strips are built in real pixels rather than a scaled viewBox so their type stays the size it
 * was designed at. Returns a function that redraws on demand — for when something other than the
 * size changed, like a web font arriving.
 */
export function drawToFit(container: HTMLElement, draw: (width: number, height: number) => void): () => void {
  let pending = 0;
  const run = () => {
    const { clientWidth, clientHeight } = container;
    if (clientWidth > 0 && clientHeight > 0) draw(clientWidth, clientHeight);
  };
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(run);
  }).observe(container);
  run();
  return run;
}

/** Collapses a burst of updates into one per frame — dragging fires far faster than it can paint. */
export function perFrame(fn: () => void): () => void {
  let queued = 0;
  return () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(fn);
  };
}
