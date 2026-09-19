// Seam: a press of the space bar + where the keyboard's focus is -> what it means for the Ride
// (issue #8: "Play/pause, also on the space bar"). The trap: a space bar that pauses only while the
// focus happens to be in the right place is a space bar that mostly doesn't pause.
import { describe, expect, it } from "vitest";
import { type SpacePress, spaceBarForTheRide } from "../src/core/ride-keys";

const space = (extra: Partial<SpacePress> = {}): SpacePress => ({ key: " ", repeat: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });
const riding = { rideOn: true, dialogOpen: false };
const exploring = { rideOn: false, dialogOpen: false };

describe("the space bar", () => {
  it("plays and pauses from the play button, from \"Ride the course\", and from a camera, where it would otherwise do nothing", () => {
    // A press of the player's buttons with a pointer hands the focus to the play button
    // (ride-controls.ts), so after Back, or the way out of free look, the space bar still pauses.
    expect(spaceBarForTheRide(space(), { ...riding, focus: "play" })).toBe("play-pause");
    expect(spaceBarForTheRide(space(), { ...exploring, focus: "play" })).toBe("play-pause"); // on "Ride the course"
  });

  it("presses the button the keyboard is on, in the player as anywhere: Tab to Back to the map, space, and the Ride is left", () => {
    expect(spaceBarForTheRide(space(), { ...riding, focus: "control" })).toBeNull();
  });

  it("plays and pauses from the map, the strip and the page while the Ride is on", () => {
    for (const focus of ["map", "strip", "page"] as const) {
      expect(spaceBarForTheRide(space(), { ...riding, focus }), focus).toBe("play-pause");
    }
  });

  it("is left alone where it already means something: another button, a box, a menu, an open dialog", () => {
    expect(spaceBarForTheRide(space(), { ...riding, focus: "control" })).toBeNull();
    expect(spaceBarForTheRide(space(), { rideOn: true, dialogOpen: true, focus: "page" })).toBeNull();
    expect(spaceBarForTheRide(space(), { rideOn: true, dialogOpen: true, focus: "play" })).toBeNull();
  });

  it("in Explore still pages down: it starts the Ride only from the map, the strip or \"Ride the course\"", () => {
    expect(spaceBarForTheRide(space(), { ...exploring, focus: "page" })).toBeNull();
    expect(spaceBarForTheRide(space(), { ...exploring, focus: "map" })).toBe("play-pause");
    expect(spaceBarForTheRide(space(), { ...exploring, focus: "strip" })).toBe("play-pause");
  });

  it("held down is one press: the repeats are swallowed, not passed on to scroll the page or toggle again", () => {
    expect(spaceBarForTheRide(space({ repeat: true }), { ...riding, focus: "strip" })).toBe("swallow");
  });

  it("with Alt, Ctrl or Cmd belongs to the browser, and any other key is not the space bar", () => {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(spaceBarForTheRide(space({ [modifier]: true }), { ...riding, focus: "page" }), modifier).toBeNull();
    }
    expect(spaceBarForTheRide(space({ key: "Enter" }), { ...riding, focus: "play" })).toBeNull();
  });
});
