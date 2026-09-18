// The race plan, in one line on the banner: race day, the start, the goal, and the button that
// opens the plan itself. The plan's form would be "a lot" on the first screen (PLAN.md principle
// 8), but what the numbers on screen rest on should never be out of sight.
//
// Same honesty as everywhere: a date the organizer hasn't confirmed says so, and a start time
// carried over from an earlier edition is greyed and says where it came from.
import type { Planner } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { paceInUnits, type Units } from "../core/units";
import { raceDate } from "../core/words";
import { html } from "../dom";

export interface PlanSummary {
  show(planner: Planner, units: Units): void;
}

export function createPlanSummary(container: HTMLElement, onOpen: () => void): PlanSummary {
  const day = html("span");
  const start = html("span");
  const goal = html("span");
  const open = html("button", { type: "button", class: "button", "aria-haspopup": "dialog", text: "Your race plan" });
  open.addEventListener("click", onOpen);
  container.replaceChildren(day, start, goal, open);

  return {
    show(planner, units) {
      const date = planner.edition.date;
      day.replaceChildren(raceDate(date.day, "short"), ...(date.confirmed ? [] : [html("small", { class: "carried-over", title: date.note, text: " not yet confirmed" })]));

      const carriedOver = planner.carriedOver;
      start.className = carriedOver ? "carried-over" : "";
      start.title = carriedOver?.reason ?? "";
      start.textContent = `${planner.wave.name} · ${planner.startLocal}${carriedOver ? ` carried over from ${carriedOver.fromEdition}` : planner.ownStartTime ? " your own time" : ""}`;

      goal.textContent = `Goal ${formatElapsed(planner.goalFinishSeconds)} at ${formatPace(paceInUnits(planner.goalPaceSecondsPerKm, units))}/${units}`;
    },
  };
}
