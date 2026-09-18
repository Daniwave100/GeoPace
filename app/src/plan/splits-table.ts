// The splits table: the time of day and the elapsed time at every kilometre, and at the finish.
// Closed until asked for, because the first screen should show little (PLAN.md principle 8).
// Every kilometre in it is a button that moves the runner there, so it is also a way to scrub.
//
// Same honesty as the readout: times of day that rest on a carried-over start time are greyed and
// say so; elapsed times come from the runner's own goal and are not.
import type { Planner } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { html } from "../dom";

/** One row per kilometre. A table in miles is `splits(1.609344)`; the units toggle will choose. */
const STEP_KM = 1;

export interface SplitsTable {
  show(planner: Planner): void;
}

/** `onPick` is called with the km of the row the runner chose. */
export function createSplitsTable(container: HTMLElement, onPick: (km: number) => void): SplitsTable {
  const about = html("p", { class: "note", id: "splits-about" });
  const rows = html("tbody");
  const header = html("tr", {}, ...["Kilometre", "Time of day", "Elapsed"].map((text) => html("th", { scope: "col", text })));
  const table = html("table", { class: "splits", "aria-describedby": "splits-about" }, html("thead", {}, header), rows);
  container.replaceChildren(html("details", {}, html("summary", { text: "Every kilometre" }), about, table));

  return {
    show(planner) {
      const splits = planner.splits(STEP_KM);
      // One zone name for the whole table, unless the clocks change mid-race: then each row says its own.
      const zones = new Set(splits.map((split) => split.zoneLabel));
      const oneZone = zones.size === 1 ? splits[0].zoneLabel : null;
      const whose = planner.carriedOver
        ? ` Times of day are greyed: they use the ${planner.carriedOver.fromEdition} start time, carried over.`
        : planner.ownStartTime
          ? " From your own start time."
          : "";
      about.textContent = `At an even pace, starting at ${planner.startLocal}${oneZone ? ` ${oneZone}` : ""}.${whose}${lineNote(planner)}`;

      rows.replaceChildren(
        ...splits.map((split) => {
          const isFinish = split.km === planner.lengthKm;
          const go = html("button", { type: "button", text: isFinish ? `Finish · ${split.km.toFixed(2)}` : String(Math.round(split.km / STEP_KM) * STEP_KM) });
          go.addEventListener("click", () => onPick(split.km));
          return html(
            "tr",
            {},
            html("th", { scope: "row" }, go),
            html("td", { class: planner.carriedOver ? "carried-over" : undefined, text: oneZone ? split.localClock : `${split.localClock} ${split.zoneLabel}` }),
            html("td", { text: formatElapsed(split.elapsedSeconds) }),
          );
        }),
      );
    },
  };
}

/**
 * Why a kilometre in the table can take less than the runner's pace. Kilometres are counted along
 * the mapped course line (PLAN.md D20), which runs longer than the certified distance a pace is
 * quoted for: New York's is 42.69 km. Said only when the difference shows at the second.
 */
function lineNote(planner: Planner): string {
  const perLineKm = formatPace(planner.goalFinishSeconds / planner.lengthKm);
  const pace = formatPace(planner.goalPaceSecondsPerKm);
  if (perLineKm === pace) return "";
  return ` Each kilometre here takes ${perLineKm}, not your ${pace} pace, because kilometres are counted along the mapped course, which at ${planner.lengthKm.toFixed(2)} km runs a little longer than the certified distance.`;
}
