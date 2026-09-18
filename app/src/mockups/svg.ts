// The smallest possible DOM helpers. The mockups build their own markup rather than pulling in a
// UI framework, because the framework question is still open (PLAN.md §4.1) and nothing here
// should decide it.

export const SVG_NS = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number | boolean | undefined>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs);
  node.append(...children);
  return node;
}

export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  node.append(...children);
  return node;
}

function apply(node: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.setAttribute("class", String(value));
    else if (name === "text") node.textContent = String(value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
}

/** An SVG polygon's `points` attribute from a list of coordinates. */
export function points(list: { x: number; y: number }[]): string {
  return list.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Draw something sized to its container, and draw it again when the container changes size. The
 * strips are built in real pixels rather than a scaled viewBox so their type stays the size it
 * was designed at.
 */
export function drawToFit(container: HTMLElement, draw: (width: number, height: number) => void): void {
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
}

/** Collapses a burst of updates into one per frame — dragging fires far faster than it can paint. */
export function perFrame(fn: () => void): () => void {
  let queued = 0;
  return () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(fn);
  };
}

/** A link that opens in a new tab without handing the opener over. */
export function link(href: string, text: string, className?: string): HTMLAnchorElement {
  return html("a", { href, target: "_blank", rel: "noopener", class: className, text });
}
