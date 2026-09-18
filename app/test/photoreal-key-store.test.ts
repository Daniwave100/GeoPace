// Seam: the runner's own key <-> the browser's storage. The key lives there and nowhere else, so a
// "reload" here is a fresh read of the same storage. The keys are invented (see photoreal-key.test.ts).
import { describe, expect, it } from "vitest";
import type { OwnKey } from "../src/photoreal/key";
import { forgetKey, type KeyStorage, loadPhotoreal, rememberKey, rememberLook } from "../src/photoreal/key-store";

const GOOGLE: OwnKey = { provider: "google", secret: "AIza" + "Sy-invented_0123456789-abcdefghijklmnop".slice(0, 35) };
const ION: OwnKey = { provider: "cesium-ion", secret: ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "pZCI6MX0", "invented-signature"].join(".") };

/** The browser's localStorage, minus the browser. */
function fakeStorage(initial: Record<string, string> = {}): KeyStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value), removeItem: (key) => void delete items[key] };
}

const brokenStorage: KeyStorage = {
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

describe("own key store", () => {
  it("starts with no key, and the look off", () => {
    expect(loadPhotoreal(fakeStorage())).toEqual({ key: null, on: false });
  });

  it("remembers the key across a reload, with photoreal on", () => {
    const storage = fakeStorage();

    expect(rememberKey(storage, ION)).toBe(true);

    expect(loadPhotoreal(storage)).toEqual({ key: ION, on: true });
  });

  it("remembers that the runner turned photoreal off, and keeps the key", () => {
    const storage = fakeStorage();
    rememberKey(storage, GOOGLE);

    rememberLook(storage, false);

    expect(loadPhotoreal(storage)).toEqual({ key: GOOGLE, on: false });
  });

  it("forgets the key completely: nothing of it is left in storage", () => {
    const storage = fakeStorage();
    rememberKey(storage, GOOGLE);

    forgetKey(storage);

    expect(loadPhotoreal(storage)).toEqual({ key: null, on: false });
    expect(JSON.stringify(storage.items)).not.toContain(GOOGLE.secret);
  });

  it("keeps the key apart from the Race Plan, which is safe to share or export", () => {
    const storage = fakeStorage();
    rememberKey(storage, GOOGLE);

    expect(Object.keys(storage.items)).toEqual(["geopace.photoreal"]);
  });

  it("treats what is stored as untrusted: unreadable, or a key filed under the wrong provider, is no key", () => {
    const wrongProvider = JSON.stringify({ key: { provider: "google", secret: ION.secret }, on: true });
    for (const stored of ["not json", "null", "[]", '{"key":7,"on":true}', '{"key":{"provider":"google","secret":"hello"},"on":true}', wrongProvider]) {
      expect(loadPhotoreal(fakeStorage({ "geopace.photoreal": stored })), stored).toEqual({ key: null, on: false });
    }
  });

  it("carries on when the browser refuses storage, and says the key wasn't remembered", () => {
    expect(loadPhotoreal(brokenStorage)).toEqual({ key: null, on: false });
    expect(rememberKey(brokenStorage, ION)).toBe(false);
    expect(() => rememberLook(brokenStorage, false)).not.toThrow();
    expect(() => forgetKey(brokenStorage)).not.toThrow();
  });
});
