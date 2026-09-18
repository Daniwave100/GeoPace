// The readout: the three numbers that say where and when the runner is (kilometre, time of day,
// elapsed time). Plain on purpose; the look arrives with #6.
//
// Honesty rule (PLAN.md principle 5): when the wave's start time is carried over from an earlier
// edition, the time of day rests on it, so it is greyed and says so. The km and the elapsed time
// come from the runner's own goal and stay as they are.
import type { Planner, Readout } from "../core/planner";
import { formatElapsed } from "../core/race-clock";
import { html } from "../dom";

export interface ReadoutView {
  show(planner: Planner, readout: Readout): void;
}

export function createReadout(container: HTMLElement): ReadoutView {
  const km = figure("Kilometre");
  const clock = figure("Time of day");
  const elapsed = figure("Elapsed");
  container.replaceChildren(km.box, clock.box, elapsed.box);

  return {
    show(planner, readout) {
      km.value.textContent = readout.km.toFixed(2);
      km.note.textContent = `of ${planner.lengthKm.toFixed(2)} km along the course line`;
      clock.value.textContent = `${readout.localClock} ${readout.zoneLabel}`;
      elapsed.value.textContent = formatElapsed(readout.elapsedSeconds);
      elapsed.note.textContent = "at an even pace";

      const carriedOver = planner.carriedOver;
      clock.value.classList.toggle("carried-over", carriedOver !== null);
      clock.note.textContent = carriedOver ? `Carried over: uses the ${carriedOver.fromEdition} start time` : "";
      clock.box.title = carriedOver?.reason ?? "";
    },
  };
}

function figure(label: string): { box: HTMLElement; value: HTMLElement; note: HTMLElement } {
  const value = html("strong", { class: "figure-value" });
  const note = html("small", { class: "figure-note" });
  return { box: html("div", { class: "figure" }, html("span", { class: "figure-label", text: label }), value, note), value, note };
}
