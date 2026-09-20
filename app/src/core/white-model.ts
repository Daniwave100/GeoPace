// How much of the White model the runner's computer is asked to draw. Two plain choices, both
// remembered in the browser.
//
// Heavy 3D kills weak GPUs (PLAN.md §8), so there has to be a way down from day one. The cost is
// almost all in the shadows, not in the blocks: the blocks are one lump of geometry the card
// draws once, while a shadow means drawing the whole city a second time, from the sun, into a
// square of memory whose size is the setting. So the quality setting is the shadows, and the
// conservative default is the smaller square with hard edges — which is also the look the poster
// asked for (PLAN.md §6: solid black shadows).
import { type BrowserStorage, isRecord, readStored, writeStored } from "../browser-storage";

/** Whether the city's buildings are drawn at all. Off leaves the plain map the app had before. */
export type Buildings = "on" | "off";
/** The shadows the sun casts through those buildings, and how much they cost to draw. */
export type Shadows = "off" | "simple" | "detailed";

export interface WhiteModelChoice {
  buildings: Buildings;
  shadows: Shadows;
}

export const BUILDINGS_CHOICES: { choice: Buildings; label: string; explained: string }[] = [
  { choice: "on", label: "On", explained: "" },
  { choice: "off", label: "Off", explained: "no buildings, just the map" },
];

export const SHADOW_CHOICES: { choice: Shadows; label: string; explained: string }[] = [
  { choice: "off", label: "Off", explained: "" },
  { choice: "simple", label: "Simple", explained: "hard-edged, and easier on an older computer" },
  { choice: "detailed", label: "Detailed", explained: "softer edges, and further from you" },
];

/**
 * What CesiumJS's shadow map is set to for each quality.
 *
 * `size` is the square of memory the city is drawn into from the sun, and is the whole of the
 * cost: four times the pixels is four times the work, every frame. `soft` spreads each shadow's
 * edge over several reads of that square, which costs again.
 *
 * `withinM` is how far from the camera a shadow is still drawn, and is **not** a taste: set below
 * the height the camera is flying at, nothing is shadowed at all, because the ground is further
 * away than the limit. Both are set well above every camera this app uses — the Ride holds 1,500 m
 * From above, and a runner looking at a street is a few hundred metres up — so the only view
 * without shadows is the whole course from twenty kilometres up, where a building is a speck.
 */
export const SHADOW_QUALITY: Record<Exclude<Shadows, "off">, { size: number; soft: boolean; withinM: number }> = {
  simple: { size: 1024, soft: false, withinM: 6000 },
  detailed: { size: 2048, soft: true, withinM: 12000 },
};

/** Buildings on, shadows on but cheap: the city and its moving shadows on a computer that can't spare much. */
export const DEFAULT_WHITE_MODEL: WhiteModelChoice = { buildings: "on", shadows: "simple" };

export type WhiteModelStorage = Pick<BrowserStorage, "getItem" | "setItem">;

const KEY = "geopace.white-model";

export function loadWhiteModelChoice(storage: WhiteModelStorage): WhiteModelChoice {
  const stored = readStored(storage, KEY);
  if (!isRecord(stored)) return DEFAULT_WHITE_MODEL;
  return {
    buildings: BUILDINGS_CHOICES.some((c) => c.choice === stored.buildings) ? (stored.buildings as Buildings) : DEFAULT_WHITE_MODEL.buildings,
    shadows: SHADOW_CHOICES.some((c) => c.choice === stored.shadows) ? (stored.shadows as Shadows) : DEFAULT_WHITE_MODEL.shadows,
  };
}

export function saveWhiteModelChoice(storage: WhiteModelStorage, choice: WhiteModelChoice): void {
  writeStored(storage, KEY, choice); // if the browser won't keep it, it lasts for this visit
}
