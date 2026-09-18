// The readout: the three numbers that say where and when the runner is (kilometre, time of day,
// elapsed time), and where the sun is at that moment. Plain on purpose; the look arrives with #6.
//
// Honesty rule (PLAN.md principle 5): when the wave's start time is carried over from an earlier
// edition, the time of day and the sun rest on it, so both are greyed and say so. Elapsed time
// and the km come from the runner's own goal and stay as they are.
import { sunOnRunner } from "../core/bearing";
import type { Planner, Readout } from "../core/planner";
import { formatElapsed } from "../core/race-clock";
import type { SunPosition } from "../core/solar";
import { compass } from "../core/words";

export interface ReadoutView {
  show(planner: Planner, readout: Readout, sun: SunPosition, headingDeg: number): void;
}

export function createReadout(container: HTMLElement): ReadoutView {
  const km = figure("Kilometre");
  const clock = figure("Time of day");
  const elapsed = figure("Elapsed");
  const sun = figure("Sun");
  container.replaceChildren(km.box, clock.box, elapsed.box, sun.box);

  return {
    show(planner, readout, sunNow, headingDeg) {
      km.value.textContent = readout.km.toFixed(2);
      km.note.textContent = `of ${planner.lengthKm.toFixed(2)} km along the course line`;
      clock.value.textContent = `${readout.localClock} ${readout.zoneLabel}`;
      elapsed.value.textContent = formatElapsed(readout.elapsedSeconds);
      elapsed.note.textContent = "at an even pace";
      sun.value.textContent = sunWords(sunNow, headingDeg);

      const carriedOver = planner.carriedOver;
      for (const dependsOnStartTime of [clock, sun]) {
        dependsOnStartTime.box.classList.toggle("carried-over", carriedOver !== null);
        dependsOnStartTime.note.textContent = carriedOver ? `Carried over: uses the ${carriedOver.fromEdition} start time` : "";
        dependsOnStartTime.box.title = carriedOver?.reason ?? "";
      }
    },
  };
}

/** "31° up, SE, over your left shoulder": the sun from where the runner is, facing the way they run. */
function sunWords(sun: SunPosition, headingDeg: number): string {
  if (sun.altitudeDeg <= 0) return "below the horizon";
  const side = sunOnRunner(headingDeg, sun.azimuthDeg).side;
  const where = side === "ahead" ? "in your eyes" : side === "behind" ? "behind you" : `over your ${side} shoulder`;
  return `${sun.altitudeDeg.toFixed(0)}° up, ${compass(sun.azimuthDeg)}, ${where}`;
}

function figure(label: string): { box: HTMLElement; value: HTMLElement; note: HTMLElement } {
  const box = document.createElement("div");
  box.className = "figure";
  const name = document.createElement("span");
  name.className = "figure-label";
  name.textContent = label;
  const value = document.createElement("strong");
  value.className = "figure-value";
  const note = document.createElement("small");
  note.className = "figure-note";
  box.append(name, value, note);
  return { box, value, note };
}
