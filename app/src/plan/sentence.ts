// The sentence: the one plain-language line saying what the course is doing where the runner is.
// Each layer will add its clause (PLAN.md D35). The first is the sun, straight from the race
// clock: it is what lets a runner see that scrubbing moves the sun too.
import { sunOnRunner } from "../core/bearing";
import type { CarriedOver } from "../core/planner";
import type { SunPosition } from "../core/solar";
import { compass } from "../core/words";
import { html } from "../dom";

export interface SentenceView {
  /** `carriedOver` greys the line: the sun is worked out from a start time that is last edition's. */
  show(sun: SunPosition, headingDeg: number, carriedOver: CarriedOver | null): void;
}

export function createSentence(container: HTMLElement): SentenceView {
  const clause = html("span");
  const flag = html("small");
  container.replaceChildren(clause, flag);
  return {
    show(sun, headingDeg, carriedOver) {
      clause.textContent = sunClause(sun, headingDeg);
      clause.classList.toggle("carried-over", carriedOver !== null);
      flag.textContent = carriedOver ? ` Carried over: worked out from the ${carriedOver.fromEdition} start time.` : "";
      container.title = carriedOver?.reason ?? "";
    },
  };
}

/** "Sun 25° up in the SE, over your right shoulder." From where the runner is, facing the way they run. */
export function sunClause(sun: SunPosition, headingDeg: number): string {
  if (sun.altitudeDeg <= 0) return "The sun is below the horizon.";
  const side = sunOnRunner(headingDeg, sun.azimuthDeg).side;
  const where = side === "ahead" ? "in your eyes" : side === "behind" ? "behind you" : `over your ${side} shoulder`;
  return `Sun ${sun.altitudeDeg.toFixed(0)}° up in the ${compass(sun.azimuthDeg)}, ${where}.`;
}
