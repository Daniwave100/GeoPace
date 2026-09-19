// The Ride's controls, under the sentence (PLAN.md D34, D46; issue #8). In Explore they are one
// button, "Ride the course". In the Ride they are the player a runner already knows: Back, play
// or pause, Ride to the next stop; which of the two cameras; and the way back to the map. What
// the Ride does is decided in core/ride.ts; this only shows it and passes the presses on.
import type { RideCamera } from "../core/ride";
import { html } from "../dom";

export interface RideActions {
  playPause(): void;
  back(): void;
  rideToNextStop(): void;
  useCamera(camera: RideCamera): void;
  leave(): void;
}

export interface RideShowing {
  /** Whether the screen is in the Ride; paused counts. */
  on: boolean;
  playing: boolean;
  camera: RideCamera;
  /** "Stop 9 of 18: Ed Koch Queensboro Bridge", or "Next stop: Barclays Center, in 7.1 km". */
  stopLine: string;
  /** Whether there is a Stop to go back to, and one to ride on to. */
  canGoBack: boolean;
  canRideOn: boolean;
}

export interface RideControls {
  show(showing: RideShowing): void;
}

const CAMERAS: { camera: RideCamera; label: string }[] = [
  { camera: "from-above", label: "From above" },
  { camera: "on-the-road", label: "On the road" },
];

export function createRideControls(container: HTMLElement, actions: RideActions): RideControls {
  const button = (className: string, onPress: () => void) => {
    const node = html("button", { type: "button", class: className });
    node.addEventListener("click", onPress);
    return node;
  };
  // One button starts the Ride and then plays and pauses it, so the space bar, which presses
  // whatever button has the focus, does the same thing before and after the first press.
  const play = button("button ride-play", actions.playPause);
  const back = button("button", actions.back);
  back.textContent = "Back";
  back.title = "Back to the stop before";
  const next = button("button ride-next", actions.rideToNextStop);
  next.textContent = "Ride to the next stop";
  const leave = button("ride-leave", actions.leave);
  leave.textContent = "Back to the map";

  const stopLine = html("p", { class: "ride-stop" });
  const inputs = CAMERAS.map(({ camera }) => html("input", { type: "radio", name: "ride-camera", value: camera }));
  inputs.forEach((input, index) => input.addEventListener("change", () => input.checked && actions.useCamera(CAMERAS[index].camera)));
  const cameras = html("fieldset", { class: "ride-cameras" }, html("legend", { class: "visually-hidden", text: "Camera" }), ...CAMERAS.map(({ label }, index) => html("label", {}, inputs[index], label)));
  const player = html("div", { class: "ride-player" }, stopLine, html("div", { class: "ride-buttons" }, back, next), cameras, html("p", { class: "ride-foot" }, leave, html("span", { text: "Space bar: play or pause." })));
  container.replaceChildren(play, player);

  return {
    show(showing) {
      container.toggleAttribute("data-riding", showing.on);
      play.textContent = !showing.on ? "Ride the course" : showing.playing ? "Pause" : showing.canRideOn ? "Ride on" : "Ride it again";
      player.hidden = !showing.on;
      // Only set when it changes: the Ride calls this sixty times a second.
      if (stopLine.textContent !== showing.stopLine) stopLine.textContent = showing.stopLine;
      back.disabled = !showing.canGoBack;
      next.disabled = !showing.canRideOn;
      inputs.forEach((input, index) => (input.checked = CAMERAS[index].camera === showing.camera));
    },
  };
}
