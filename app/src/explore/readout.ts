// The readout: the three numbers that say where and when the runner is. The distance is the one
// giant numeral on the screen (PLAN.md §6), in the blue, because blue is where you are.
//
// Honesty rule (PLAN.md principle 5): when the wave's start time is carried over from an earlier
// edition, the time of day rests on it, so it is greyed and says so. The distance and the elapsed
// time come from the runner's own goal and stay as they are.
import type { Planner, Readout } from "../core/planner";
import { formatElapsed } from "../core/race-clock";
import { distanceNumber, formatDistance, type Units } from "../core/units";
import { html } from "../dom";

export interface ReadoutView {
  show(planner: Planner, readout: Readout, units: Units): void;
}

export function createReadout(container: HTMLElement): ReadoutView {
  const whole = html("span", { class: "readout-km-whole" });
  const part = html("span", { class: "readout-km-part" });
  const unit = html("span", { class: "readout-km-unit" });
  const of = html("p", { class: "readout-of" });
  const clock = figure("Time of day");
  const elapsed = figure("Elapsed");
  container.replaceChildren(
    // Not a live region: it changes on every pointer move. The strip's slider says it aloud instead.
    html("div", { class: "readout-km" }, whole, part, unit),
    of,
    html("div", { class: "readout-times" }, clock.box, elapsed.box),
  );

  return {
    show(planner, readout, units) {
      const [before, after] = distanceNumber(readout.km, units).split(".");
      whole.textContent = before;
      part.textContent = `.${after}`;
      unit.textContent = units;
      of.textContent = `of ${formatDistance(planner.lengthKm, units)} along the course line`;

      clock.value.replaceChildren(readout.localClock, " ", html("small", { text: readout.zoneLabel }));
      elapsed.value.textContent = formatElapsed(readout.elapsedSeconds);
      elapsed.note.textContent = "at an even pace";

      const carriedOver = planner.carriedOver;
      clock.value.classList.toggle("carried-over", carriedOver !== null);
      clock.note.textContent = carriedOver ? `Carried over: uses the ${carriedOver.fromEdition} start time` : planner.ownStartTime ? "from your own start time" : "";
      clock.box.title = carriedOver?.reason ?? "";
    },
  };
}

function figure(label: string): { box: HTMLElement; value: HTMLElement; note: HTMLElement } {
  const value = html("span", { class: "readout-value" });
  const note = html("span", { class: "readout-note" });
  return { box: html("div", { class: "readout-time" }, value, html("span", { class: "readout-label", text: label }), note), value, note };
}
