// The sentence on the page. What it says is decided in core/sentence.ts; this only sets it, and
// gives each clause the look of the kind of claim it is (core/encoding.ts): a not-measured value
// is grey and struck through with the words "Not measured here." left standing, and a clause that
// rests on a carried-over start time is greyed. Where a clause has more to say (why the height
// isn't measured on this bridge, what the trees are wearing, whose list a station is on), that is
// the clause's tooltip and its hidden text — not printed under the sentence, which it used to be:
// a paragraph about the German Weather Service's phenological year under every Berlin sentence
// made the block scroll (owner, 09-22: "remove that huge description for now"). The same facts
// stand in "What the marks mean" and in Sources & credits, where they don't move.
import { ENCODINGS } from "../core/encoding";
import type { Clause } from "../core/layers";
import { html } from "../dom";

/** What carrying over meant when only a wave time could be carried over. */
const CARRIED_OVER_SAID = " (from a start time carried over from an earlier edition)";

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
  const look = ENCODINGS[clause.encoding];
  const node = html("span", { class: [look.cssClass, ...(clause.carriedOver ? ["carried-over"] : [])].join(" "), title: clause.note });
  // Struck through only where the value itself is in doubt; the words after it stay standing.
  node.append(clause.encoding === "not-measured" ? html("s", { text: clause.text }) : clause.text);
  if (look.saidAfter) node.append(` ${look.saidAfter}`);
  // A screen reader can't see grey: it is told in words — the clause's own, where it has them.
  if (clause.carriedOver) node.append(html("span", { class: "visually-hidden", text: clause.carriedOverSaid ?? CARRIED_OVER_SAID }));
  if (clause.note) node.append(html("span", { class: "visually-hidden", text: ` ${clause.note}` }));
  return node;
}

/** The sentence as one plain string, for the strip's slider to say aloud. */
export function sentenceInWords(clauses: Clause[]): string {
  return clauses.map((clause) => [clause.text, ENCODINGS[clause.encoding].saidAfter].filter(Boolean).join(" ")).join(" ");
}
