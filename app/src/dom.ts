// The smallest possible DOM helpers. The app builds its own markup rather than pulling in a UI
// framework, because the framework question is still open (PLAN.md §4.1) and nothing here should
// decide it.

export type Attrs = Record<string, string | number | boolean | undefined>;

/** `html("p", { class: "note", text: "…" }, child, "more text")`. `text` sets the text content. */
export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  node.append(...children);
  return node;
}

/** A link that opens in a new tab: every source and credit in the app is one of these. */
export function link(href: string, text: string, className?: string): HTMLAnchorElement {
  return html("a", { href, target: "_blank", rel: "noopener", class: className, text });
}

/** Where a fact comes from and the day it was checked (CLAUDE.md: every fact about the world has both). */
export interface Source {
  source: string;
  accessed: string;
}

/** The "Source" link that follows a fact; hovering says when it was checked. */
export function sourceLink(fact: Source): HTMLAnchorElement {
  const source = link(fact.source, "Source");
  source.title = `Checked on ${fact.accessed}`;
  return source;
}

export function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.setAttribute("class", String(value));
    else if (name === "text") node.textContent = String(value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
}
