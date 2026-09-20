// How much of the White model the runner's computer is asked to draw. Two plain switches, both
// remembered in the browser.
//
// Heavy 3D kills weak GPUs (PLAN.md §8), so there has to be a way down from day one — but the way
// down is off, not a lesser shadow. The owner, 09-20: "I want to immediately go to detailed. I
// don't want to care about like mid detail." So there is one quality, the best the engine will
// give, and a switch that turns it off (issue #39, D57).
import { type BrowserStorage, isRecord, readStored, writeStored } from "../browser-storage";

/** Whether the city's buildings are drawn at all. Off leaves the white ground and the course on it. */
export type Buildings = "on" | "off";
/** Whether the sun casts them, at the moment the runner reaches that kilometre. */
export type Shadows = "on" | "off";

export interface WhiteModelChoice {
  buildings: Buildings;
  shadows: Shadows;
}

const ON_OR_OFF = [
  { choice: "on", label: "On", explained: "" },
  { choice: "off", label: "Off", explained: "" },
] as const;

export const BUILDINGS_CHOICES: { choice: Buildings; label: string; explained: string }[] = ON_OR_OFF.map((c) => ({ ...c, explained: c.choice === "off" ? "no buildings, just the ground and the course" : "" }));
export const SHADOWS_CHOICES: { choice: Shadows; label: string; explained: string }[] = ON_OR_OFF.map((c) => ({ ...c, explained: c.choice === "off" ? "easier on an older computer" : "" }));

/**
 * What CesiumJS's shadow map is set to. One quality, the good one.
 *
 * `size` is the square of memory the city is drawn into from the sun, shared between four
 * cascades, and is the whole of the cost: four times the pixels is four times the work, every
 * frame. `soft` spreads each shadow's edge over several reads of that square, which is what hides
 * the stair-steps a hard edge shows when the camera is far from what it is looking at.
 */
export const SHADOWS = { size: 4096, soft: true };

/**
 * How far from the camera a shadow is still drawn, from how high the camera is above the ground.
 *
 * CesiumJS spreads that one square over everything between the camera and this distance, so a
 * distance that stands still while the camera moves is wrong at both ends: far too coarse when the
 * runner is on the road, and too short to reach the ground when they pull back. It follows the
 * camera instead, and is never less than three times the camera's height, because a tilted camera
 * is further from the ground it is looking at than it is above it — set below that, *nothing* is
 * shadowed at all, silently (PLAN.md §8).
 */
export const SHADOW_DISTANCE = {
  /** Enough to reach well past what a tilted camera has on screen. */
  timesTheHeight: 3,
  /** On the road the camera is three metres up; the street still wants shadows down its length. */
  atLeastM: 2000,
  /**
   * Past this there is nothing a shadow map can do for a 20 m building: the whole course is seen
   * from 25 to 43 km up, where a building is a speck. The shadows come back on the way in.
   */
  atMostM: 20000,
};

/** Rounded to steps, so a camera drifting up and down doesn't rebuild the cascades every frame. */
const STEP = 1.25;

export function shadowDistanceM(cameraHeightAboveGroundM: number): number {
  const wanted = Math.max(cameraHeightAboveGroundM, 0) * SHADOW_DISTANCE.timesTheHeight;
  const held = Math.min(Math.max(wanted, SHADOW_DISTANCE.atLeastM), SHADOW_DISTANCE.atMostM);
  if (held <= SHADOW_DISTANCE.atLeastM) return SHADOW_DISTANCE.atLeastM;
  if (held >= SHADOW_DISTANCE.atMostM) return SHADOW_DISTANCE.atMostM;
  return Math.min(SHADOW_DISTANCE.atLeastM * STEP ** Math.ceil(Math.log(held / SHADOW_DISTANCE.atLeastM) / Math.log(STEP)), SHADOW_DISTANCE.atMostM);
}

/** The city and its shadows, both on: what the app opens with (PLAN.md D30). */
export const DEFAULT_WHITE_MODEL: WhiteModelChoice = { buildings: "on", shadows: "on" };

export type WhiteModelStorage = Pick<BrowserStorage, "getItem" | "setItem">;

const KEY = "geopace.white-model";

export function loadWhiteModelChoice(storage: WhiteModelStorage): WhiteModelChoice {
  const stored = readStored(storage, KEY);
  if (!isRecord(stored)) return DEFAULT_WHITE_MODEL;
  return {
    buildings: BUILDINGS_CHOICES.some((c) => c.choice === stored.buildings) ? (stored.buildings as Buildings) : DEFAULT_WHITE_MODEL.buildings,
    // "simple" and "detailed" are what an older version of the app wrote here: both meant on.
    shadows: stored.shadows === "off" ? "off" : DEFAULT_WHITE_MODEL.shadows,
  };
}

export function saveWhiteModelChoice(storage: WhiteModelStorage, choice: WhiteModelChoice): void {
  writeStored(storage, KEY, choice); // if the browser won't keep it, it lasts for this visit
}
