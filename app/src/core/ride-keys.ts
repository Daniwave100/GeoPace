// The space bar and the Ride (issue #8: "Play/pause, also on the space bar"). What a press means,
// with no DOM in sight: main.ts says where the keyboard's focus is, this says what happens.

/** The part of a KeyboardEvent this needs. */
export interface SpacePress {
  key: string;
  /** true for the presses a held-down key sends after the first. */
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface WhereThePressLands {
  rideOn: boolean;
  /** A dialog is open over the page: the keyboard is its own. */
  dialogOpen: boolean;
  /**
   * What has the keyboard's focus. "play": the player's play button, "Ride the course", or one of
   * the two cameras (the space bar does nothing of its own on a camera that is already chosen).
   * "control": any other control, the player's other buttons included. Or the map, the strip, or
   * nothing in particular.
   */
  focus: "play" | "map" | "strip" | "control" | "page";
}

/**
 * "play-pause": play or pause the Ride, and keep the press from the browser. "swallow": keep it
 * from the browser and do nothing (a held-down key repeating). null: not the Ride's; leave it alone.
 *
 * The space bar presses whichever button has the focus, the player's included: a runner who Tabs
 * to "Back to the map" and presses it must leave the Ride, not pause it. What keeps the space bar
 * pausing after a pointer has pressed Back or "Ride to the next stop" is that the player hands the
 * focus to its play button then (ride-controls.ts). In Explore the space bar is the Ride's only
 * from the map, the strip or "Ride the course": on a page that scrolls (a phone, where the blocks
 * stack under the map) it still pages down.
 */
export function spaceBarForTheRide(press: SpacePress, where: WhereThePressLands): "play-pause" | "swallow" | null {
  if (press.key !== " " || press.altKey || press.ctrlKey || press.metaKey) return null;
  if (where.dialogOpen || where.focus === "control") return null;
  if (where.focus === "page" && !where.rideOn) return null;
  return press.repeat ? "swallow" : "play-pause";
}
