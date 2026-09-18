// Remembers the runner's own key in the browser, and whether they left photoreal on. This is the
// only place the key is ever kept: it is never in the repo, the built app, the page's address or
// the Race Plan (PLAN.md D43). It is filed apart from the Race Plan on purpose, so that a plan can
// one day be shared or exported without a secret riding along.
import { type BrowserStorage, isRecord, readStored, writeStored } from "../browser-storage";
import { type OwnKey, recognizeKey } from "./key";

const STORED_UNDER = "geopace.photoreal";

export interface RememberedPhotoreal {
  key: OwnKey | null;
  /** Whether the runner left photoreal on, so a reload opens the way they left it. */
  on: boolean;
}

export function rememberedPhotoreal(storage: BrowserStorage): RememberedPhotoreal {
  const nothing: RememberedPhotoreal = { key: null, on: false };
  const stored = readStored(storage, STORED_UNDER);
  if (!isRecord(stored) || !isRecord(stored.key) || typeof stored.key.secret !== "string") return nothing;
  // Recognized again from its shape, so a key can never come back filed under the wrong provider.
  const key = recognizeKey(stored.key.secret);
  if (!key || key.provider !== stored.key.provider) return nothing;
  return { key, on: stored.on === true };
}

/**
 * Remember the key, and whether photoreal is on with it. Returns false when the browser wouldn't
 * keep it (this visit only). It is told which key, rather than looking one up, so an older key
 * still in storage can never come back as the one in use.
 */
export function rememberPhotoreal(storage: BrowserStorage, key: OwnKey, on: boolean): boolean {
  const remembered: RememberedPhotoreal = { key, on };
  return writeStored(storage, STORED_UNDER, remembered);
}

export function forgetKey(storage: BrowserStorage): void {
  try {
    storage.removeItem(STORED_UNDER);
  } catch {
    // Blocked storage never held the key in the first place.
  }
}
