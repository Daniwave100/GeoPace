// The splits table: the time of day and the elapsed time at every kilometre (or every mile, for
// a runner who thinks in miles), and at the finish. Closed until asked for, because the first
// screen should show little (PLAN.md principle 8). Every row is a button that moves the runner
// there, so it is also a way to scrub.
//
// Same honesty as the readout: times of day that rest on a carried-over start time are greyed and
// say so; elapsed times come from the runner's own goal and are not.
import type { Planner } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { distanceNumber, formatDistance, paceInUnits, unitKm, unitName, type Units } from "../core/units";
import { html } from "../dom";

export interface SplitsTable {
  show(planner: Planner, units: Units): void;
}

/** `onPick` is called with the km of the row the runner chose. */
export function createSplitsTable(container: HTMLElement, onPick: (km: number) => void): SplitsTable {
  const about = html("p", { class: "note", id: "splits-about" });
  const rows = html("tbody");
  const distanceHeading = html("th", { scope: "col" });
  const header = html("tr", {}, distanceHeading, ...["Time of day", "Elapsed"].map((text) => html("th", { scope: "col", text })));
  const table = html("table", { class: "splits", "aria-describedby": "splits-about" }, html("thead", {}, header), rows);
  const summary = html("summary");
  container.replaceChildren(html("details", {}, summary, about, table));

  return {
    show(planner, units) {
      // One row per kilometre or per mile: the Planner counts the marks in whatever step it is given.
      const step = unitKm(units);
      const splits = planner.splits(step);
      const unit = unitName(units);
      summary.textContent = `Every ${unit}`;
      distanceHeading.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
      // One zone name for the whole table, unless the clocks change mid-race: then each row says its own.
      const zones = new Set(splits.map((split) => split.zoneLabel));
      const oneZone = zones.size === 1 ? splits[0].zoneLabel : null;
      const whose = planner.carriedOver
        ? ` Times of day are greyed: they use the ${planner.carriedOver.fromEdition} start time, carried over.`
        : planner.ownStartTime
          ? " From your own start time."
          : "";
      about.textContent = `At an even pace, starting at ${planner.startLocal}${oneZone ? ` ${oneZone}` : ""}.${whose}${lineNote(planner, units)}`;

      rows.replaceChildren(
        ...splits.map((split) => {
          const isFinish = split.km === planner.lengthKm;
          const go = html("button", { type: "button", text: isFinish ? `Finish · ${distanceNumber(split.km, units)}` : String(Math.round(split.km / step)) });
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
 * Why a kilometre (or a mile) in the table can take less than the runner's pace. Distances are
 * counted along the mapped course line (PLAN.md D20), which runs longer than the certified
 * distance a pace is quoted for: New York's is 42.69 km. Said only when the difference shows at
 * the second.
 */
function lineNote(planner: Planner, units: Units): string {
  const perLineUnit = formatPace(paceInUnits(planner.goalFinishSeconds / planner.lengthKm, units));
  const pace = formatPace(paceInUnits(planner.goalPaceSecondsPerKm, units));
  if (perLineUnit === pace) return "";
  const unit = unitName(units);
  return ` Each ${unit} here takes ${perLineUnit}, not your ${pace} pace, because ${unitName(units, "many")} are counted along the mapped course, which at ${formatDistance(planner.lengthKm, units)} runs a little longer than the certified distance.`;
}
