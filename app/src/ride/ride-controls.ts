// The Ride's controls, laid on the top of the map (PLAN.md D34, D53; issue #8). In Explore they
// are one button, "Ride the course". Pressed, it becomes, in the same place, the player a runner
// already knows from any video: Back, play or pause; which of the two cameras; and the way back to
// the map. On the map rather than in the readout block, so they are there whatever height the strip
// leaves the map, and still there with the map on the full screen; at the top, because the bottom
// of the map is the map's own credits, the near end of the course, and, On the road, the road.
// What the Ride does is decided in core/ride.ts; this only shows it and passes the presses on.
//
// Free look (issue #28, PLAN.md D54) costs the player no control of its own (issue #32). While the
// camera is the runner's to turn, the two cameras are replaced, in the same place, by one wide
// button: "Go back to cinematic" — *cinematic* is the owner's word for the Ride's own camera, both
// of its two. So the player has as many things on it as it had before free look was built, and one
// fewer while a hand is on the map. There is no way in from the player: a hand on the map is the
// way in, and that is the whole of it.
//
// Under them, how fast the Ride plays (PLAN.md D67): a slider from ¼× to 4×, 1× being the
// time-lapse as built. The space bar still plays and pauses while it has the focus (ride-keys.ts):
// a slider has no use of its own for the space bar, and its arrows are what move it.
import { type RideCamera, RIDE_CAMERAS, RIDE_SPEEDS } from "../core/ride";
import { html } from "../dom";
import { type Choice, segmented } from "../segmented";

export interface RideActions {
  playPause(): void;
  back(): void;
  useCamera(camera: RideCamera): void;
  /** Out of free look: the camera is the Ride's own again, the one it was already riding. */
  handTheCameraBack(): void;
  /** How many times its own pace the Ride plays: one of `RIDE_SPEEDS`. */
  useSpeed(times: number): void;
  leave(): void;
}

export interface RideShowing {
  /** Whether the screen is in the Ride; paused counts. */
  on: boolean;
  playing: boolean;
  camera: RideCamera;
  /** Whether the camera is the runner's to turn rather than the Ride's (core/ride.ts). */
  freeLook: boolean;
  /** How many times its own pace the Ride plays (core/ride.ts). */
  speed: number;
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

const CAMERAS: Choice[] = [
  { value: "from-above", label: "From above", explained: "" },
  { value: "on-the-road", label: "On the road", explained: "" },
];

export function createRideControls(dock: HTMLElement, actions: RideActions): RideControls {
  const ride = html("button", { type: "button", class: "button ride-start", text: "Ride the course" });
  ride.addEventListener("click", actions.playPause);
  const play = html("button", { type: "button", class: "button ride-play", text: "Pause", title: "Play or pause (space bar)" });
  play.addEventListener("click", actions.playPause);

  /**
   * One of the player's other buttons. Pressed with a pointer, it hands the keyboard's focus to
   * the play button, so the space bar still plays and pauses afterwards instead of pressing this
   * one again (it went Back again, and never paused). Pressed from the keyboard (a click with no
   * pointer behind it has `detail` 0) the focus stays where the runner put it: the space bar is
   * how a keyboard presses a button.
   */
  const button = (className: string, text: string, onPress: () => void) => {
    const node = html("button", { type: "button", class: className, text });
    node.addEventListener("click", (event) => {
      // Greyed out (there is no Stop to go back to), it does nothing. It is `aria-disabled` rather
      // than `disabled` so that it keeps the focus it has (see `show`).
      if (node.getAttribute("aria-disabled") !== "true") onPress();
      if (event.detail > 0 && !player.hidden) play.focus();
    });
    return node;
  };
  const back = button("button", "Back", actions.back);
  back.title = "Back to the stop before";
  const leave = button("ride-leave", "Back to the map", actions.leave);
  const backToCinematic = button("button ride-back-to-cinematic", "Go back to cinematic", actions.handTheCameraBack);
  backToCinematic.title = "Give the camera back to the Ride, on the camera it was riding";
  backToCinematic.hidden = true; // a Ride begins on the Ride's own camera, so the cameras are what stands there

  const stopLine = html("p", { class: "ride-stop" });
  const cameras = segmented(
    "Camera",
    "ride-camera",
    CAMERAS,
    (value) => {
      const picked = RIDE_CAMERAS.find((camera) => camera === value);
      if (picked) actions.useCamera(picked);
    },
    "ride-cameras",
  );
  const speedSlider = html("input", { type: "range", class: "ride-speed-slider", min: "0", max: String(RIDE_SPEEDS.length - 1), step: "1", "aria-label": "Speed" }) as HTMLInputElement;
  const speedShown = html("output", { class: "ride-speed-value", "aria-hidden": "true" });
  speedSlider.addEventListener("input", () => actions.useSpeed(RIDE_SPEEDS[Number(speedSlider.value)]));
  const speed = html("label", { class: "ride-speed", title: "How fast the Ride plays" }, html("span", { text: "Speed" }), speedSlider, speedShown);
  const player = html(
    "div",
    { class: "ride-player", role: "group", "aria-label": "The Ride" },
    html("div", { class: "ride-player-head" }, stopLine, leave),
    html("div", { class: "ride-player-row" }, html("div", { class: "ride-buttons" }, back, play), cameras.box, backToCinematic),
    speed,
  );
  player.hidden = true;
  // What a screen reader is told, and only that: arriving at a Stop is the Ride's news. The line in
  // the player changes with every 50 m to the next Stop, which said aloud would be a stream of
  // numbers. It is on the page from the start, outside the player: a status that appears together
  // with its first words is often not read out at all.
  const arrived = html("p", { class: "visually-hidden", role: "status" });
  dock.replaceChildren(ride, player, arrived);

  let wasOn = false;
  let wasFreeLook = false;
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
      // The camera the Ride is riding stays lit under free look: it is the one the way back returns to.
      cameras.check(showing.camera);
      const times = `${showing.speed}×`;
      if (speedShown.textContent !== times) {
        speedShown.textContent = times;
        speedSlider.value = String(Math.max(RIDE_SPEEDS.indexOf(showing.speed), 0));
        speedSlider.setAttribute("aria-valuetext", showing.speed === 1 ? "1×, the Ride's own pace" : times);
      }

      // The way back stands where the two cameras stand, so only ever one of them is on the player.
      // Whoever had their hands on the one that goes is put on the one that arrives: the way back,
      // or the camera the Ride is on, where the space bar still plays and pauses (core/ride-keys.ts).
      // Where the focus is has to be read before either is hidden, because an element that is
      // hidden hands the focus it has back to the page.
      if (wasFreeLook !== showing.freeLook) {
        const theFocusIsOnTheOneThatGoes =
          cameras.box.contains(document.activeElement) || document.activeElement === backToCinematic;
        cameras.box.hidden = showing.freeLook;
        backToCinematic.hidden = !showing.freeLook;
        if (showing.on && theFocusIsOnTheOneThatGoes) {
          if (showing.freeLook) backToCinematic.focus();
          else cameras.focusChosen();
        }
        wasFreeLook = showing.freeLook;
      }
    },
  };
}
