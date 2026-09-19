// The Ride's controls, laid on the top of the map (PLAN.md D34, D53; issue #8). In Explore they
// are one button, "Ride the course". Pressed, it becomes, in the same place, the player a runner
// already knows from any video: Back, play or pause, Ride to the next stop; which of the two
// cameras; and the way back to the map. On the map rather than in the readout block, so they are
// there whatever height the strip leaves the map, and still there with the map on the full
// screen; at the top, because the bottom of the map is the map's own credits, the near end of the
// course, and, On the road, the road. What the Ride does is decided in core/ride.ts; this only
// shows it and passes the presses on.
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

export function createRideControls(dock: HTMLElement, actions: RideActions): RideControls {
  const button = (className: string, text: string, onPress: () => void) => {
    const node = html("button", { type: "button", class: className, text });
    node.addEventListener("click", onPress);
    return node;
  };
  const ride = button("button ride-start", "Ride the course", actions.playPause);
  const play = button("button ride-play", "Pause", actions.playPause);
  play.title = "Play or pause (space bar)";
  const back = button("button", "Back", actions.back);
  back.title = "Back to the stop before";
  const next = button("button", "Ride to the next stop", actions.rideToNextStop);
  const leave = button("ride-leave", "Back to the map", actions.leave);

  // Said aloud when it changes: arriving at a Stop is the Ride's news. Between Stops it changes
  // only when the distance to the next one rounds to a new number, not sixty times a second.
  const stopLine = html("p", { class: "ride-stop", role: "status" });
  const inputs = CAMERAS.map(({ camera }) => html("input", { type: "radio", name: "ride-camera", value: camera }));
  inputs.forEach((input, index) => input.addEventListener("change", () => input.checked && actions.useCamera(CAMERAS[index].camera)));
  const cameras = html("fieldset", { class: "ride-cameras" }, html("legend", { class: "visually-hidden", text: "Camera" }), ...CAMERAS.map(({ label }, index) => html("label", {}, inputs[index], label)));

  const bar = html(
    "div",
    { class: "ride-bar", role: "group", "aria-label": "The Ride" },
    html("div", { class: "ride-bar-head" }, stopLine, leave),
    html("div", { class: "ride-bar-row" }, html("div", { class: "ride-buttons" }, back, play, next), cameras),
  );
  bar.hidden = true;
  dock.replaceChildren(ride, bar);

  let wasOn = false;
  return {
    show(showing) {
      // Whoever had the focus keeps a control under their hands when the two swap places.
      const hadFocus = dock.contains(document.activeElement);
      ride.hidden = showing.on;
      bar.hidden = !showing.on;
      if (hadFocus && wasOn !== showing.on) (showing.on ? play : ride).focus();
      wasOn = showing.on;

      play.textContent = showing.playing ? "Pause" : showing.canRideOn ? "Ride on" : "Ride it again";
      // Only set when it changes: the Ride calls this on every frame.
      if (stopLine.textContent !== showing.stopLine) stopLine.textContent = showing.stopLine;
      // A button that stops applying keeps the focus it has: `aria-disabled`, not `disabled`, which would drop it.
      back.setAttribute("aria-disabled", String(!showing.canGoBack));
      next.setAttribute("aria-disabled", String(!showing.canRideOn));
      inputs.forEach((input, index) => {
        const checked = CAMERAS[index].camera === showing.camera;
        if (input.checked !== checked) input.checked = checked;
      });
    },
  };
}
