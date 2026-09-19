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
   * What has the keyboard's focus: the Ride's player ("Ride the course", or any control of the
   * bar), the map, the strip, some other control (a button, a box, a menu, a link), or nothing
   * in particular.
   */
  focus: "player" | "map" | "strip" | "control" | "page";
}

/**
 * "play-pause": play or pause the Ride, and keep the press from the browser. "swallow": keep it
 * from the browser and do nothing (a held-down key repeating). null: not the Ride's; leave it alone.
 *
 * In the player the space bar is always play or pause, whichever control was pressed last: a
 * space bar that went Back again, or rode to the next stop again, because that button still had
 * the focus would mostly not pause. Enter presses the control that has the focus. In Explore the
 * space bar is the Ride's only from the map, the strip or the player: on a page that scrolls
 * (a phone, where the blocks stack under the map) it still pages down.
 */
export function spaceBarForTheRide(press: SpacePress, where: WhereThePressLands): "play-pause" | "swallow" | null {
  if (press.key !== " " || press.altKey || press.ctrlKey || press.metaKey) return null;
  if (where.dialogOpen || where.focus === "control") return null;
  if (where.focus === "page" && !where.rideOn) return null;
  return press.repeat ? "swallow" : "play-pause";
}
