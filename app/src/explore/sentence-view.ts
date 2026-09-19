// The sentence on the page. What it says is decided in core/sentence.ts; this only sets it, and
// gives each clause the look of the kind of claim it is (core/encoding.ts): a not-measured value
// is grey and struck through with the words "Not measured here." left standing, and a clause that
// rests on a carried-over start time is greyed. Where a clause has a reason to give (why the
// height isn't measured on this bridge), the reason is printed under the sentence: a tooltip
// alone would keep it from anyone on a keyboard or a phone.
import { ENCODINGS } from "../core/encoding";
import type { Clause } from "../core/layers";
import { html } from "../dom";

export interface SentenceView {
  show(clauses: Clause[]): void;
}

export function createSentence(container: HTMLElement): SentenceView {
  return {
    show(clauses) {
      const notes = clauses.flatMap((clause) => (clause.note ? [clause.note] : []));
      container.replaceChildren(
        ...clauses.flatMap((clause, index) => [...(index > 0 ? [" "] : []), clauseNode(clause)]),
        ...notes.map((note) => html("small", { class: "sentence-note", text: note })),
      );
    },
  };
}

function clauseNode(clause: Clause): HTMLElement {
  const look = ENCODINGS[clause.encoding];
  const node = html("span", { class: [look.cssClass, ...(clause.carriedOver ? ["carried-over"] : [])].join(" ") });
  // Struck through only where the value itself is in doubt; the words after it stay standing.
  node.append(clause.encoding === "not-measured" ? html("s", { text: clause.text }) : clause.text);
  if (look.saidAfter) node.append(` ${look.saidAfter}`);
  // A screen reader can't see grey: it is told in words.
  if (clause.carriedOver) node.append(html("span", { class: "visually-hidden", text: " (from a start time carried over from an earlier edition)" }));
  return node;
}

/** The sentence as one plain string, for the strip's slider to say aloud. */
export function sentenceInWords(clauses: Clause[]): string {
  return clauses.map((clause) => [clause.text, ENCODINGS[clause.encoding].saidAfter].filter(Boolean).join(" ")).join(" ");
}
