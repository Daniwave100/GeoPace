// The km strip: the whole course as one line of kilometres, and the control for where the runner
// is. Drag it, click it, or use the keyboard. Deliberately plain: the designed strip, with a row
// per layer, arrives with Explore (#6). What is settled here is how it behaves.
//
// To a screen reader it is a slider, which is what it is: one value (the km) between two ends.
// All the arithmetic lives in core/scrub.ts, where it is tested; this file only listens and draws.
import { kmAfterKey, kmAtFraction } from "../core/scrub";
import { html } from "../dom";

const TICK_EVERY_KM = 5;

export interface Strip {
  /** Lay the strip out for a course of this length. */
  showCourse(lengthKm: number): void;
  /** Put the marker at `km`. `spoken` is what a screen reader says: "km 21.1, 11:10, 2:00:00 elapsed". */
  setKm(km: number, spoken: string): void;
}

/** `onScrub` is called with the km the runner asked for; the caller decides and calls `setKm` back. */
export function createStrip(container: HTMLElement, onScrub: (km: number) => void): Strip {
  let lengthKm = 1;
  let km = 0;

  const ticks = html("div", { class: "strip-ticks" });
  const marker = html("div", { class: "strip-marker" });
  const track = html("div", { class: "strip-track" }, ticks, marker);
  const slider = html("div", { class: "strip", role: "slider", tabindex: 0, "aria-label": "Where you are on the course, in kilometres", "aria-valuemin": 0 }, track);
  container.replaceChildren(slider);

  const scrubToPointer = (event: PointerEvent) => {
    const box = track.getBoundingClientRect();
    onScrub(kmAtFraction((event.clientX - box.left) / box.width, lengthKm));
  };
  slider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    slider.setPointerCapture(event.pointerId); // keep following the pointer if it leaves the strip
    slider.focus();
    scrubToPointer(event);
  });
  slider.addEventListener("pointermove", (event) => {
    if (slider.hasPointerCapture(event.pointerId)) scrubToPointer(event);
  });
  slider.addEventListener("keydown", (event) => {
    const target = kmAfterKey(event, km, lengthKm);
    if (target === null) return;
    event.preventDefault(); // the arrows and Page Up/Down would otherwise scroll the page
    onScrub(target);
  });

  return {
    showCourse(length) {
      lengthKm = length;
      slider.setAttribute("aria-valuemax", length.toFixed(2));
      ticks.replaceChildren();
      for (let at = 0; at <= length; at += TICK_EVERY_KM) {
        const tick = html("div", { class: "strip-tick", text: String(at) });
        tick.style.left = `${(at / length) * 100}%`;
        ticks.append(tick);
      }
    },
    setKm(value, spoken) {
      km = value;
      marker.style.left = `${(value / lengthKm) * 100}%`;
      slider.setAttribute("aria-valuenow", value.toFixed(2));
      slider.setAttribute("aria-valuetext", spoken);
    },
  };
}
