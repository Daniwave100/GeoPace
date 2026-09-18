// Remembers the runner's own key in the browser, and whether they left photoreal on. This is the
// only place the key is ever kept: it is never in the repo, the built app, the page's address or
// the Race Plan (PLAN.md D3). It is filed apart from the Race Plan on purpose, so that a plan can
// one day be shared or exported without a secret riding along.
//
// Storage is never trusted, as with the Race Plan: it may be blocked, full, or hold something an
// older version wrote. Reading always ends in an answer; saving and forgetting never throw.
import { type OwnKey, recognizeKey } from "./key";

/** The three methods of the browser's `localStorage` this needs; tests pass a stand-in. */
export type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "geopace.photoreal";

export interface RememberedPhotoreal {
  key: OwnKey | null;
  /** Whether the runner left photoreal on, so a reload opens the way they left it. */
  on: boolean;
}

export function loadPhotoreal(storage: KeyStorage): RememberedPhotoreal {
  const nothing: RememberedPhotoreal = { key: null, on: false };
  let stored: unknown;
  try {
    stored = JSON.parse(storage.getItem(KEY) ?? "null");
  } catch {
    return nothing; // blocked storage, or not JSON
  }
  if (!isRecord(stored) || !isRecord(stored.key) || typeof stored.key.secret !== "string") return nothing;
  // Recognized again from its shape, so a key can never come back filed under the wrong provider.
  const key = recognizeKey(stored.key.secret);
  if (!key || key.provider !== stored.key.provider) return nothing;
  return { key, on: stored.on === true };
}

/** A new key turns photoreal on. Returns false when the browser wouldn't keep it (this visit only). */
export function rememberKey(storage: KeyStorage, key: OwnKey): boolean {
  return write(storage, { key, on: true });
}

export function rememberLook(storage: KeyStorage, on: boolean): void {
  const { key } = loadPhotoreal(storage);
  if (key) write(storage, { key, on });
}

export function forgetKey(storage: KeyStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Blocked storage never held the key in the first place.
  }
}

function write(storage: KeyStorage, remembered: RememberedPhotoreal): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(remembered));
    return true;
  } catch {
    return false; // blocked or full
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
