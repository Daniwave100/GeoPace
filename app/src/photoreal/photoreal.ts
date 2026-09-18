// Photoreal, as the runner meets it: paste a key, turn it on and off, forget the key. This module
// decides; it draws nothing. The 3D scene is handed in as `loadTiles`, and the browser's storage as
// `storage`, so everything here runs in a test without a browser.
//
// Two promises it keeps:
//   - the key comes from the paste box or from the browser's storage, and from nowhere else (PLAN.md D43);
//   - whatever goes wrong with the imagery, the app ends up on the keyless look with a reason the
//     runner can read (D44). The course, the strip and the planning layers never depended on it.
import type { BrowserStorage } from "../browser-storage";
import { type OwnKey, recognizeKey } from "./key";
import { forgetKey, rememberedPhotoreal, rememberPhotoreal } from "./key-store";

/** Why photoreal isn't showing although the runner asked for it. */
export type PhotorealProblem =
  | "refused" // the provider said no to this key
  | "over-limit" // the provider says this key has been used too much for now
  | "unreachable" // no answer at all: offline, or the provider is down
  | "tiles-failing"; // it started, then the imagery stopped arriving

export interface PhotorealState {
  /** "keyless" is whatever the app shows with no set-up: the map today, the White model after #7. */
  look: "keyless" | "loading" | "photoreal";
  key: OwnKey | null;
  problem: PhotorealProblem | null;
  /** The browser wouldn't keep the key, so it lasts for this visit only. */
  thisVisitOnly: boolean;
}

/** This many tiles failing one after another, with none arriving in between, means the imagery has stopped. */
const FAILED_TILES_BEFORE_FALLBACK = 8;

/**
 * Photoreal imagery the provider has agreed to send, as much of it as this module needs. It is
 * not on screen until `show` is called, so imagery that arrives after the runner has changed
 * their mind never reaches the screen at all.
 */
export interface PhotorealTiles {
  /** Put it in the scene. `onTile` is called for every tile from then on: true when it arrived, false when it failed. */
  show(onTile: (arrived: boolean) => void): void;
  /** Take it out of the scene (if it was ever in) and let the keyless look back through. */
  remove(): void;
}

/** One Load. Rejects when the provider refuses the key or can't be reached; an HTTP status, if any, is on `statusCode`. */
export type LoadTiles = (key: OwnKey) => Promise<PhotorealTiles>;

export interface Photoreal {
  readonly state: PhotorealState;
  /** `listener` is told the state every time it changes. */
  onChange(listener: (state: PhotorealState) => void): void;
  /** On opening the app: back into photoreal if that is how the runner left it. */
  start(): Promise<void>;
  /** A pasted key: recognized, remembered, and photoreal turned on. False when it is neither kind of key. */
  useKey(pasted: string): Promise<boolean>;
  /** With the key already there. Does nothing without one, or while photoreal is loading or showing. */
  turnOn(): Promise<void>;
  turnOff(): void;
  /** Turns photoreal off and removes the key from the browser. */
  forgetKey(): void;
}

export function createPhotoreal(options: { storage: BrowserStorage; loadTiles: LoadTiles }): Photoreal {
  const { storage, loadTiles } = options;
  const listeners: ((state: PhotorealState) => void)[] = [];
  let state: PhotorealState = { look: "keyless", key: null, problem: null, thisVisitOnly: false };
  let tiles: PhotorealTiles | undefined; // what is in the scene while the look is "photoreal"
  let loading: Promise<void> | undefined; // the load under way while the look is "loading"
  let asked = 0; // goes up whenever the runner changes their mind, so a load that finishes late can tell

  function become(next: Partial<PhotorealState>): void {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  }

  /** Every load counts against the runner's allowance with the provider, so there is never more than one under way. */
  function turnOn(): Promise<void> {
    if (!state.key || state.look === "photoreal") return Promise.resolve();
    if (!loading) {
      const mine: Promise<void> = load(state.key).finally(() => {
        if (loading === mine) loading = undefined; // unless a newer load has taken its place
      });
      loading = mine;
    }
    return loading;
  }

  async function load(key: OwnKey): Promise<void> {
    const mine = ++asked;
    become({ look: "loading", problem: null, thisVisitOnly: !rememberPhotoreal(storage, key, true) });
    let loaded: PhotorealTiles;
    try {
      loaded = await loadTiles(key);
    } catch (answer) {
      if (mine === asked) become({ look: "keyless", problem: problemFrom(answer) });
      return;
    }
    if (mine !== asked) {
      loaded.remove(); // the runner turned it off, or changed the key, while it loaded: never shown
      return;
    }
    tiles = loaded;

    // The key was accepted, but the imagery can still stop arriving: the connection drops, or the
    // provider ends the session (Google allows about three hours per load). A failed tile here and
    // there is normal; a run of them, or a failure before anything has arrived, is not.
    let anyArrived = false;
    let failedInARow = 0;
    loaded.show((arrived) => {
      if (tiles !== loaded) return;
      if (arrived) {
        anyArrived = true;
        failedInARow = 0;
        return;
      }
      failedInARow += 1;
      if (!anyArrived || failedInARow >= FAILED_TILES_BEFORE_FALLBACK) backToKeyless({ problem: "tiles-failing" });
    });
    become({ look: "photoreal" });
  }

  /** Whatever was showing or loading is dropped. The map underneath was never taken away, so this can't fail. */
  function backToKeyless(next: Partial<PhotorealState>): void {
    asked += 1;
    loading = undefined;
    tiles?.remove();
    tiles = undefined;
    become({ look: "keyless", problem: null, ...next });
  }

  return {
    get state() {
      return state;
    },
    onChange(listener) {
      listeners.push(listener);
    },
    async start() {
      const remembered = rememberedPhotoreal(storage);
      become({ key: remembered.key });
      if (remembered.on) await turnOn();
    },
    async useKey(pasted) {
      const key = recognizeKey(pasted);
      if (!key) return false;
      const sameKey = state.key?.secret === key.secret;
      if (!sameKey) backToKeyless({ key }); // turning it on is what remembers it
      await turnOn();
      return true;
    },
    turnOn,
    turnOff() {
      if (state.key) rememberPhotoreal(storage, state.key, false);
      backToKeyless({});
    },
    forgetKey() {
      forgetKey(storage);
      backToKeyless({ key: null, thisVisitOnly: false });
    },
  };
}

/** What a failed request for the imagery means to the runner, from its HTTP status if it has one. */
function problemFrom(answer: unknown): PhotorealProblem {
  const status = typeof answer === "object" && answer !== null && "statusCode" in answer ? answer.statusCode : undefined;
  if (status === 429) return "over-limit";
  // 400: not a valid key. 401: not a valid token. 403: the key's project can't use these tiles. 404: nor can this token.
  if (status === 400 || status === 401 || status === 403 || status === 404) return "refused";
  return "unreachable";
}
