// The browser's own storage (localStorage), which is where the app remembers the Race Plan and the
// runner's own key. Nothing leaves the computer: there are no accounts and no server (PLAN.md
// principle 1).
//
// Storage is never trusted. It may be blocked (private windows), full, or hold something an older
// version of the app wrote. So reading always ends in an answer, and writing never throws.

/** The three methods of the browser's `localStorage` the app needs; tests pass a stand-in. */
export type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's own storage, or a stand-in that remembers nothing where the browser forbids it. */
export function browserStorage(): BrowserStorage {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

/** What is stored under `name`, read as JSON. Null when there is nothing, it isn't JSON, or storage is blocked. */
export function readStored(storage: Pick<BrowserStorage, "getItem">, name: string): unknown {
  try {
    return JSON.parse(storage.getItem(name) ?? "null");
  } catch {
    return null;
  }
}

/** False when the browser wouldn't keep it (blocked or full): it then lasts for this visit only. */
export function writeStored(storage: Pick<BrowserStorage, "setItem">, name: string, value: unknown): boolean {
  try {
    storage.setItem(name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
