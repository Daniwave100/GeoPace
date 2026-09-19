// Seam: a press of the space bar + where the keyboard's focus is -> what it means for the Ride
// (issue #8: "Play/pause, also on the space bar"). The trap: a space bar that pauses only while the
// focus happens to be in the right place is a space bar that mostly doesn't pause.
import { describe, expect, it } from "vitest";
import { type SpacePress, spaceBarForTheRide } from "../src/core/ride-keys";

const space = (extra: Partial<SpacePress> = {}): SpacePress => ({ key: " ", repeat: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });
const riding = { rideOn: true, dialogOpen: false };
const exploring = { rideOn: false, dialogOpen: false };

describe("the space bar", () => {
  it("plays and pauses the Ride wherever the focus is in the player, whichever of its buttons was pressed last", () => {
    // After "Ride to the next stop", Back or a camera, the focus is on that control. Space there is
    // still play or pause; Enter is what presses the control itself.
    expect(spaceBarForTheRide(space(), { ...riding, focus: "player" })).toBe("play-pause");
    expect(spaceBarForTheRide(space(), { ...exploring, focus: "player" })).toBe("play-pause"); // on "Ride the course"
  });

  it("plays and pauses from the map, the strip and the page while the Ride is on", () => {
    for (const focus of ["map", "strip", "page"] as const) {
      expect(spaceBarForTheRide(space(), { ...riding, focus }), focus).toBe("play-pause");
    }
  });

  it("is left alone where it already means something: another button, a box, a menu, an open dialog", () => {
    expect(spaceBarForTheRide(space(), { ...riding, focus: "control" })).toBeNull();
    expect(spaceBarForTheRide(space(), { rideOn: true, dialogOpen: true, focus: "page" })).toBeNull();
    expect(spaceBarForTheRide(space(), { rideOn: true, dialogOpen: true, focus: "player" })).toBeNull();
  });

  it("in Explore still pages down: it starts the Ride only from the map, the strip or the player", () => {
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
    expect(spaceBarForTheRide(space({ key: "Enter" }), { ...riding, focus: "player" })).toBeNull();
  });
});
