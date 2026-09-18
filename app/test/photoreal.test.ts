// Seam: Photoreal as the runner meets it (paste a key, turn it on and off, forget the key) on one
// side; the browser's storage and the 3D scene's tiles on the other, both stand-ins here. What
// must hold: the key comes from the paste box or from storage and nowhere else, and whatever goes
// wrong with the imagery, the app is back on the keyless look and says why.
import { describe, expect, it } from "vitest";
import type { OwnKey } from "../src/photoreal/key";
import { type KeyStorage, loadPhotoreal, rememberKey } from "../src/photoreal/key-store";
import { createPhotoreal, type PhotorealState, type PhotorealTiles } from "../src/photoreal/photoreal";

const GOOGLE: OwnKey = { provider: "google", secret: "AIza" + "Sy-invented_0123456789-abcdefghijklmnop".slice(0, 35) };
const ION: OwnKey = { provider: "cesium-ion", secret: ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "pZCI6MX0", "invented-signature"].join(".") };

function fakeStorage(): KeyStorage {
  const items: Record<string, string> = {};
  return { getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value), removeItem: (key) => void delete items[key] };
}

/** The 3D scene, minus the 3D: it records which keys it was asked to load tiles with, and what became of them. */
function fakeScene(loads: (key: OwnKey) => Promise<void> = async () => undefined) {
  const scene = {
    askedWith: [] as OwnKey[],
    showing: 0,
    /** Pretend a tile arrived (true) or failed (false) in the tiles loaded last. */
    tile: (_arrived: boolean): void => undefined,
    loadTiles: async (key: OwnKey): Promise<PhotorealTiles> => {
      scene.askedWith.push(key);
      await loads(key);
      scene.showing += 1;
      return {
        watch: (onTile) => void (scene.tile = onTile),
        remove: () => void (scene.showing -= 1),
      };
    },
  };
  return scene;
}

function photorealWith(storage: KeyStorage, scene: ReturnType<typeof fakeScene>) {
  const seen: PhotorealState[] = [];
  const photoreal = createPhotoreal({ storage, loadTiles: scene.loadTiles, onChange: (state) => seen.push(state) });
  return { photoreal, seen };
}

/** The looks the runner saw, in order. */
function looks(seen: PhotorealState[]): string[] {
  return seen.map((state) => state.look).filter((look, i, all) => look !== all[i - 1]);
}

describe("Photoreal", () => {
  it("opens on the keyless look when the runner has no key, and asks the scene for nothing", async () => {
    const scene = fakeScene();
    const { photoreal } = photorealWith(fakeStorage(), scene);

    await photoreal.start();

    expect(photoreal.state).toEqual({ look: "keyless", key: null, problem: null, thisVisitOnly: false });
    expect(scene.askedWith).toEqual([]);
  });

  it("turns photoreal on with a pasted key, and remembers the key in the browser", async () => {
    const storage = fakeStorage();
    const scene = fakeScene();
    const { photoreal, seen } = photorealWith(storage, scene);
    await photoreal.start();

    expect(await photoreal.useKey(` ${ION.secret}\n`)).toBe(true);

    expect(scene.askedWith).toEqual([ION]);
    expect(looks(seen)).toEqual(["keyless", "loading", "photoreal"]);
    expect(photoreal.state).toEqual({ look: "photoreal", key: ION, problem: null, thisVisitOnly: false });
    expect(loadPhotoreal(storage)).toEqual({ key: ION, on: true });
  });

  it("refuses a paste that is neither kind of key, and sends it nowhere", async () => {
    const storage = fakeStorage();
    const scene = fakeScene();
    const { photoreal } = photorealWith(storage, scene);
    await photoreal.start();

    expect(await photoreal.useKey("hello")).toBe(false);

    expect(scene.askedWith).toEqual([]);
    expect(photoreal.state.look).toBe("keyless");
    expect(loadPhotoreal(storage).key).toBeNull();
  });

  it("after a reload, reads the key from the browser's storage and opens in photoreal again", async () => {
    const storage = fakeStorage();
    rememberKey(storage, GOOGLE);
    const scene = fakeScene();
    const { photoreal } = photorealWith(storage, scene);

    await photoreal.start();

    expect(scene.askedWith).toEqual([GOOGLE]);
    expect(photoreal.state.look).toBe("photoreal");
  });

  it("falls back to the keyless look and says why when the imagery can't be had", async () => {
    // What a provider's answer means to the runner. Google answers a bad key with 400 and a project
    // without the Map Tiles API or billing with 403; Cesium answers a bad token with 401.
    const answers: [unknown, string][] = [
      [{ statusCode: 400 }, "refused"],
      [{ statusCode: 401 }, "refused"],
      [{ statusCode: 403 }, "refused"],
      [{ statusCode: 429 }, "over-limit"],
      [{ statusCode: undefined }, "unreachable"],
      [new Error("offline"), "unreachable"],
      [{ statusCode: 503 }, "unreachable"],
    ];
    for (const [answer, problem] of answers) {
      const storage = fakeStorage();
      const scene = fakeScene(() => Promise.reject(answer));
      const { photoreal, seen } = photorealWith(storage, scene);
      await photoreal.start();

      expect(await photoreal.useKey(GOOGLE.secret), problem).toBe(true); // it is a key; it just didn't work

      expect(looks(seen), problem).toEqual(["keyless", "loading", "keyless"]);
      expect(photoreal.state, problem).toEqual({ look: "keyless", key: GOOGLE, problem, thisVisitOnly: false });
      expect(scene.showing, problem).toBe(0);
      // The key is kept, so the runner can fix it at the provider and try again without pasting.
      expect(loadPhotoreal(storage).key, problem).toEqual(GOOGLE);
    }
  });

  it("falls back when the imagery stops arriving: eight tiles failing in a row", async () => {
    const scene = fakeScene();
    const { photoreal } = photorealWith(fakeStorage(), scene);
    await photoreal.useKey(ION.secret);
    scene.tile(true);

    for (let failed = 1; failed <= 7; failed++) scene.tile(false);
    expect(photoreal.state.look).toBe("photoreal");
    scene.tile(false);

    expect(photoreal.state).toEqual({ look: "keyless", key: ION, problem: "tiles-failing", thisVisitOnly: false });
    expect(scene.showing).toBe(0);
  });

  it("doesn't give up over a failed tile here and there", async () => {
    const scene = fakeScene();
    const { photoreal } = photorealWith(fakeStorage(), scene);
    await photoreal.useKey(ION.secret);

    for (let round = 0; round < 10; round++) {
      scene.tile(true);
      for (let failed = 1; failed <= 7; failed++) scene.tile(false);
    }

    expect(photoreal.state.look).toBe("photoreal");
    expect(scene.showing).toBe(1);
  });

  it("falls back at once when the very first tile fails, since nothing is on screen yet", async () => {
    const scene = fakeScene();
    const { photoreal } = photorealWith(fakeStorage(), scene);
    await photoreal.useKey(ION.secret);

    scene.tile(false);

    expect(photoreal.state.look).toBe("keyless");
    expect(photoreal.state.problem).toBe("tiles-failing");
    expect(scene.showing).toBe(0);
  });

  it("turns off and on again without another paste, and a reload opens the way the runner left it", async () => {
    const storage = fakeStorage();
    const scene = fakeScene();
    const { photoreal } = photorealWith(storage, scene);
    await photoreal.useKey(GOOGLE.secret);

    photoreal.turnOff();

    expect(photoreal.state).toEqual({ look: "keyless", key: GOOGLE, problem: null, thisVisitOnly: false });
    expect(scene.showing).toBe(0);
    const reloaded = photorealWith(storage, fakeScene());
    await reloaded.photoreal.start();
    expect(reloaded.photoreal.state).toEqual({ look: "keyless", key: GOOGLE, problem: null, thisVisitOnly: false });

    await photoreal.turnOn();

    expect(photoreal.state.look).toBe("photoreal");
    expect(scene.showing).toBe(1);
    expect(loadPhotoreal(storage).on).toBe(true);
  });

  it("forgets the key: the imagery goes, and nothing of the key is left in the browser", async () => {
    const storage = fakeStorage();
    const scene = fakeScene();
    const { photoreal } = photorealWith(storage, scene);
    await photoreal.useKey(GOOGLE.secret);

    photoreal.forgetKey();

    expect(photoreal.state).toEqual({ look: "keyless", key: null, problem: null, thisVisitOnly: false });
    expect(scene.showing).toBe(0);
    expect(loadPhotoreal(storage)).toEqual({ key: null, on: false });
    await photoreal.turnOn(); // nothing to turn on with
    expect(scene.askedWith).toEqual([GOOGLE]);
  });

  it("asks the provider once, however many times the runner presses the button while it loads", async () => {
    // Every load counts against the runner's monthly allowance, so a double click mustn't cost two.
    let finishLoading = (): void => undefined;
    const scene = fakeScene(() => new Promise((resolve) => (finishLoading = resolve)));
    const { photoreal } = photorealWith(fakeStorage(), scene);

    const first = photoreal.useKey(ION.secret);
    const second = photoreal.turnOn();
    finishLoading();
    await Promise.all([first, second]);

    expect(scene.askedWith).toEqual([ION]);
    expect(scene.showing).toBe(1);
  });

  it("throws away imagery that arrives after the runner changed their mind", async () => {
    let finishLoading = (): void => undefined;
    const scene = fakeScene(() => new Promise((resolve) => (finishLoading = resolve)));
    const { photoreal } = photorealWith(fakeStorage(), scene);

    const loading = photoreal.useKey(ION.secret);
    photoreal.turnOff();
    finishLoading();
    await loading;

    expect(photoreal.state.look).toBe("keyless");
    expect(scene.showing).toBe(0);
  });

  it("still asks once per key when a first key's load is overtaken by a second key", async () => {
    const finish: (() => void)[] = [];
    const scene = fakeScene(() => new Promise((resolve) => finish.push(resolve)));
    const { photoreal } = photorealWith(fakeStorage(), scene);

    const first = photoreal.useKey(GOOGLE.secret);
    const second = photoreal.useKey(ION.secret);
    finish[0]();
    await first;
    const third = photoreal.turnOn(); // the second key is still loading: this must wait for it, not ask again
    finish[1]();
    await Promise.all([second, third]);

    expect(scene.askedWith).toEqual([GOOGLE, ION]);
    expect(scene.showing).toBe(1);
    expect(photoreal.state).toEqual({ look: "photoreal", key: ION, problem: null, thisVisitOnly: false });
  });

  it("replaces one key with another: the first key's imagery goes before the second is used", async () => {
    const storage = fakeStorage();
    const scene = fakeScene();
    const { photoreal } = photorealWith(storage, scene);
    await photoreal.useKey(GOOGLE.secret);

    await photoreal.useKey(ION.secret);

    expect(scene.askedWith).toEqual([GOOGLE, ION]);
    expect(scene.showing).toBe(1);
    expect(photoreal.state.key).toEqual(ION);
    expect(loadPhotoreal(storage).key).toEqual(ION);
  });

  it("says so when the browser won't keep the key, and still shows photoreal for this visit", async () => {
    const blocked: KeyStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage is blocked");
      },
      removeItem: () => undefined,
    };
    const scene = fakeScene();
    const { photoreal } = photorealWith(blocked, scene);

    await photoreal.useKey(ION.secret);

    expect(photoreal.state).toEqual({ look: "photoreal", key: ION, problem: null, thisVisitOnly: true });
  });
});
