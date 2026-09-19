// The Ride's controls, laid on the top of the map (PLAN.md D34, D53; issue #8). In Explore they
// are one button, "Ride the course". Pressed, it becomes, in the same place, the player a runner
// already knows from any video: Back, play or pause, Ride to the next stop; which of the two
// cameras; and the way back to the map. On the map rather than in the readout block, so they are
// there whatever height the strip leaves the map, and still there with the map on the full
// screen; at the top, because the bottom of the map is the map's own credits, the near end of the
// course, and, On the road, the road. What the Ride does is decided in core/ride.ts; this only
// shows it and passes the presses on.
//
// The two cameras are three choices (issue #28, PLAN.md D54): the Ride's two, and Look around, the
// camera the runner turns themselves. A hand on the map chooses that one, and choosing either of
// the others is how the camera is handed back to the Ride.
import { type RideCamera, RIDE_CAMERAS } from "../core/ride";
import { html } from "../dom";
import { type Choice, segmented } from "../segmented";

export interface RideActions {
  playPause(): void;
  back(): void;
  rideToNextStop(): void;
  useCamera(camera: RideCamera): void;
  /** The camera is the runner's to turn: what a hand on the map does, and what this says out loud for anyone not using one. */
  lookAround(): void;
  leave(): void;
}

export interface RideShowing {
  /** Whether the screen is in the Ride; paused counts. */
  on: boolean;
  playing: boolean;
  camera: RideCamera;
  /** Whether the camera is the runner's to turn rather than the Ride's (core/ride.ts). */
  freeLook: boolean;
  /** "Stop 9 of 18: Ed Koch Queensboro Bridge", or "Next stop: Barclays Center, in 7.1 km". */
  stopLine: string;
  /** The Stop the runner is on, as it is said aloud on arriving; null between Stops. */
  arrivedAt: string | null;
  /** Whether there is a Stop to go back to, and one to ride on to. */
  canGoBack: boolean;
  canRideOn: boolean;
}

export interface RideControls {
  show(showing: RideShowing): void;
}

/** The third choice beside the two cameras: not one of the Ride's, so not a `RideCamera`. */
const LOOK_AROUND = "look-around";

const CAMERAS: Choice[] = [
  { value: "from-above", label: "From above", explained: "" },
  { value: "on-the-road", label: "On the road", explained: "" },
  { value: LOOK_AROUND, label: "Look around", explained: "drag the map to turn the camera round yourself; the Ride plays on" },
];

export function createRideControls(dock: HTMLElement, actions: RideActions): RideControls {
  const ride = html("button", { type: "button", class: "button ride-start", text: "Ride the course" });
  ride.addEventListener("click", actions.playPause);
  const play = html("button", { type: "button", class: "button ride-play", text: "Pause", title: "Play or pause (space bar)" });
  play.addEventListener("click", actions.playPause);

  /**
   * One of the player's other buttons. Pressed with a pointer, it hands the keyboard's focus to
   * the play button, so the space bar still plays and pauses afterwards instead of pressing this
   * one again (it went Back again, or rode to the next stop again, and never paused). Pressed from
   * the keyboard (a click with no pointer behind it has `detail` 0) the focus stays where the
   * runner put it: the space bar is how a keyboard presses a button.
   */
  const button = (className: string, text: string, onPress: () => void) => {
    const node = html("button", { type: "button", class: className, text });
    node.addEventListener("click", (event) => {
      // Greyed out (there is no Stop to go back to, or to ride on to), it does nothing. It is
      // `aria-disabled` rather than `disabled` so that it keeps the focus it has (see `show`).
      if (node.getAttribute("aria-disabled") !== "true") onPress();
      if (event.detail > 0 && !player.hidden) play.focus();
    });
    return node;
  };
  const back = button("button", "Back", actions.back);
  back.title = "Back to the stop before";
  const next = button("button", "Ride to the next stop", actions.rideToNextStop);
  const leave = button("ride-leave", "Back to the map", actions.leave);

  const stopLine = html("p", { class: "ride-stop" });
  const cameras = segmented(
    "Camera",
    "ride-camera",
    CAMERAS,
    (value) => {
      const picked = RIDE_CAMERAS.find((camera) => camera === value);
      if (picked) actions.useCamera(picked);
      else actions.lookAround();
    },
    "ride-cameras",
  );
  const player = html(
    "div",
    { class: "ride-player", role: "group", "aria-label": "The Ride" },
    html("div", { class: "ride-player-head" }, stopLine, leave),
    html("div", { class: "ride-player-row" }, html("div", { class: "ride-buttons" }, back, play, next), cameras.box),
  );
  player.hidden = true;
  // What a screen reader is told, and only that: arriving at a Stop is the Ride's news. The line in
  // the player changes with every 50 m to the next Stop, which said aloud would be a stream of
  // numbers. It is on the page from the start, outside the player: a status that appears together
  // with its first words is often not read out at all.
  const arrived = html("p", { class: "visually-hidden", role: "status" });
  dock.replaceChildren(ride, player, arrived);

  let wasOn = false;
  return {
    show(showing) {
      // Whoever had the focus keeps a control under their hands when the two swap places.
      const hadFocus = dock.contains(document.activeElement);
      ride.hidden = showing.on;
      player.hidden = !showing.on;
      if (hadFocus && wasOn !== showing.on) (showing.on ? play : ride).focus();
      wasOn = showing.on;

      play.textContent = showing.playing ? "Pause" : showing.canRideOn ? "Ride on" : "Ride it again";
      // Only set when it changes: the Ride calls this on every frame.
      if (stopLine.textContent !== showing.stopLine) stopLine.textContent = showing.stopLine;
      const said = showing.on ? (showing.arrivedAt ?? "") : "";
      if (arrived.textContent !== said) arrived.textContent = said;
      // A button that stops applying keeps the focus it has: `aria-disabled`, not `disabled`, which would drop it.
      back.setAttribute("aria-disabled", String(!showing.canGoBack));
      next.setAttribute("aria-disabled", String(!showing.canRideOn));
      cameras.check(showing.freeLook ? LOOK_AROUND : showing.camera);
    },
  };
}
