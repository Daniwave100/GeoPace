// How a runner gets their own key: where, roughly how long it takes, and what it costs. These are
// facts about the world, so each carries its source and the day it was checked (CLAUDE.md). The
// providers change their prices and free allowances from time to time: re-check before a release.
// The times are our own rough estimates, not the providers' claims, and the panel says "about".
import type { Source } from "../dom";
import type { KeyProvider } from "./key";

export interface Sourced extends Source {
  text: string;
}

export interface KeyHelp {
  heading: string;
  /** Our estimate of the set-up time, start to finish, for someone who has never done it. */
  time: string;
  cost: Sourced[];
  steps: string[];
  /** Where the steps start. */
  startAt: { text: string; url: string };
  stepsSource: Source;
  /** What to check when the provider refuses the key. */
  ifRefused: string;
}

/** Cesium ion first: it is free for a runner's own use, so it is the one most runners should pick. */
export const KEY_HELP: Record<KeyProvider, KeyHelp> = {
  "cesium-ion": {
    heading: "A Cesium ion token: free, and the quicker of the two",
    time: "About 5 minutes.",
    cost: [
      {
        text: "Free for personal, non-commercial projects. It includes 1,000 photoreal loads a month.",
        source: "https://cesium.com/platform/cesium-ion/pricing/",
        accessed: "2026-09-18",
      },
    ],
    steps: ["Create a free Cesium ion account.", "Open “Access Tokens”. Every account already has a default token.", "Copy the token and paste it below."],
    startAt: { text: "ion.cesium.com (Access Tokens)", url: "https://ion.cesium.com/tokens" },
    stepsSource: { source: "https://cesium.com/learn/ion/cesium-ion-access-tokens/", accessed: "2026-09-18" },
    ifRefused: "Check that the token was copied whole, and that “Google Photorealistic 3D Tiles” is among My Assets in your ion account (it can be added from ion's Asset Depot).",
  },
  google: {
    heading: "A Google Maps key: straight from Google, needs a payment card",
    time: "About 15 minutes.",
    cost: [
      {
        text: "Google only gives keys to a Google Cloud project with billing switched on, which means a payment card.",
        source: "https://developers.google.com/maps/documentation/tile/usage-and-billing",
        accessed: "2026-09-18",
      },
      {
        text: "The first 1,000 photoreal loads each month are free. After that Google charges $6.00 per 1,000.",
        source: "https://developers.google.com/maps/billing-and-pricing/pricing",
        accessed: "2026-09-18",
      },
    ],
    steps: [
      "In the Google Cloud console, create a project and switch on billing.",
      "Enable the “Map Tiles API” for that project.",
      "Under “Credentials”, create an API key. Google recommends restricting it to the Map Tiles API.",
      "Copy the key and paste it below.",
    ],
    startAt: { text: "Google’s own step-by-step guide", url: "https://developers.google.com/maps/documentation/tile/get-api-key" },
    stepsSource: { source: "https://developers.google.com/maps/documentation/tile/get-api-key", accessed: "2026-09-18" },
    ifRefused: "Check that the key was copied whole, that its project has billing switched on, and that the Map Tiles API is enabled for it.",
  },
};

/** What the providers count, in the runner's terms. */
export const WHAT_A_LOAD_IS: Sourced = {
  text: "A load is counted each time photoreal starts: when GeoPace opens with it on, or when you turn it on. Looking around afterwards is not counted, for up to three hours.",
  source: "https://developers.google.com/maps/documentation/tile/usage-and-billing",
  accessed: "2026-09-18",
};

/** Why photoreal's shadows are not the app's shade numbers (PLAN.md D4). */
export const ILLUSTRATIVE_SHADOWS =
  "The shadows in this imagery were there when it was photographed, at some other hour and season. They are illustrative. GeoPace's numbers come from its measured layers, never from this picture.";
