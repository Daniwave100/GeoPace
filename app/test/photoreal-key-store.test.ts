// Seam: the runner's own key <-> the browser's storage. The key lives there and nowhere else, so a
// "reload" here is a fresh read of the same storage. The keys are invented (see photoreal-fixtures.ts).
import { describe, expect, it } from "vitest";
import { forgetKey, rememberedPhotoreal, rememberPhotoreal } from "../src/photoreal/key-store";
import { brokenStorage, fakeStorage, GOOGLE, ION } from "./photoreal-fixtures";

describe("own key store", () => {
  it("starts with no key, and the look off", () => {
    expect(rememberedPhotoreal(fakeStorage())).toEqual({ key: null, on: false });
  });

  it("remembers the key across a reload, with photoreal on", () => {
    const storage = fakeStorage();

    expect(rememberPhotoreal(storage, ION, true)).toBe(true);

    expect(rememberedPhotoreal(storage)).toEqual({ key: ION, on: true });
  });

  it("remembers that the runner turned photoreal off, and keeps the key", () => {
    const storage = fakeStorage();
    rememberPhotoreal(storage, GOOGLE, true);

    rememberPhotoreal(storage, GOOGLE, false);

    expect(rememberedPhotoreal(storage)).toEqual({ key: GOOGLE, on: false });
  });

  it("remembers the look for the key it is given, never for an older one still in storage", () => {
    // The browser kept an old key, then wouldn't keep the new one (storage full, say). Remembering
    // the look must not quietly write the old key back as the one in use.
    const storage = fakeStorage();
    rememberPhotoreal(storage, GOOGLE, true);

    rememberPhotoreal(storage, ION, true);

    expect(rememberedPhotoreal(storage)).toEqual({ key: ION, on: true });
  });

  it("forgets the key completely: nothing of it is left in storage", () => {
    const storage = fakeStorage();
    rememberPhotoreal(storage, GOOGLE, true);

    forgetKey(storage);

    expect(rememberedPhotoreal(storage)).toEqual({ key: null, on: false });
    expect(JSON.stringify(storage.items)).not.toContain(GOOGLE.secret);
  });

  it("keeps the key apart from the Race Plan, which is safe to share or export", () => {
    const storage = fakeStorage();
    rememberPhotoreal(storage, GOOGLE, true);

    expect(Object.keys(storage.items)).toEqual(["geopace.photoreal"]);
  });

  it("treats what is stored as untrusted: unreadable, or a key filed under the wrong provider, is no key", () => {
    const wrongProvider = JSON.stringify({ key: { provider: "google", secret: ION.secret }, on: true });
    for (const stored of ["not json", "null", "[]", '{"key":7,"on":true}', '{"key":{"provider":"google","secret":"hello"},"on":true}', wrongProvider]) {
      expect(rememberedPhotoreal(fakeStorage({ "geopace.photoreal": stored })), stored).toEqual({ key: null, on: false });
    }
  });

  it("carries on when the browser refuses storage, and says the key wasn't remembered", () => {
    expect(rememberedPhotoreal(brokenStorage)).toEqual({ key: null, on: false });
        expect(rememberPhotoreal(brokenStorage, ION, true)).toBe(false);
    expect(() => forgetKey(brokenStorage)).not.toThrow();
  });
});
