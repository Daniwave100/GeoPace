// The sentence on the page. What it says is decided in core/sentence.ts; this only sets it, and
// gives each clause the look of the kind of claim it is (core/encoding.ts): a not-measured value
// is grey and struck through with the words "not measured here" left standing, and a clause that
// rests on a carried-over start time is greyed.
import { ENCODINGS } from "../core/encoding";
import type { Clause } from "../core/layers";
import { html } from "../dom";

export interface SentenceView {
  show(clauses: Clause[]): void;
}

export function createSentence(container: HTMLElement): SentenceView {
  return {
    show(clauses) {
      container.replaceChildren(...clauses.flatMap((clause, index) => [...(index > 0 ? [" "] : []), clauseNode(clause)]));
    },
  };
}

function clauseNode(clause: Clause): HTMLElement {
  const classes = [ENCODINGS[clause.encoding].cssClass, ...(clause.carriedOver ? ["carried-over"] : [])].join(" ");
  const node = html("span", { class: classes, title: clause.note });
  if (clause.encoding === "not-measured") node.append(html("s", { text: clause.text }), " Not measured here.");
  else if (clause.encoding === "sample") node.append(clause.text, " (sample)");
  else node.append(clause.text);
  // A screen reader can't see grey: it is told in words.
  if (clause.carriedOver) node.append(html("span", { class: "visually-hidden", text: " (from a start time carried over from an earlier edition)" }));
  return node;
}

/** The sentence as one plain string, for the strip's slider to say aloud. */
export function sentenceInWords(clauses: Clause[]): string {
  return clauses.map((clause) => (clause.encoding === "not-measured" ? `${clause.text} Not measured here.` : clause.text)).join(" ");
}
