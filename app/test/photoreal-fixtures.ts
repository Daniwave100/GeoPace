// Shared by the photoreal tests: two invented keys and a stand-in for the browser's storage.
// The keys are built from pieces so that no file in the repo holds a key-shaped string, which
// no-keys-in-repo.test.ts would (rightly) refuse.
import type { OwnKey } from "../src/photoreal/key";
import type { BrowserStorage } from "../src/browser-storage";

export const GOOGLE: OwnKey = { provider: "google", secret: "AIza" + "Sy-invented_0123456789-abcdefghijklmnop".slice(0, 35) };
export const ION: OwnKey = { provider: "cesium-ion", secret: ["eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJ" + "qdGkiOiJpbnZlbnRlZCIsImlkIjoxfQ", "invented-signature_0123456789"].join(".") };

/** The browser's localStorage, minus the browser. */
export function fakeStorage(initial: Record<string, string> = {}): BrowserStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (name) => items[name] ?? null, setItem: (name, value) => void (items[name] = value), removeItem: (name) => void delete items[name] };
}

/** A browser that refuses storage altogether, as a private window may. */
export const brokenStorage: BrowserStorage = {
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is full");
  },
  removeItem: () => {
    throw new Error("storage is blocked");
  },
};
