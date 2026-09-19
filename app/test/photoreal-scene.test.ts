// Seam: photoreal imagery <-> the 3D scene. The tileset is a real CesiumJS one (made with the
// network replaced by a canned answer); the viewer is a stand-in with only the two things this
// touches: the plain ground, and the list of what is drawn. What must hold (PLAN.md D43, D44):
// the view is never blank, the plain ground comes back exactly when this imagery took it away,
// and a failed tile's address, which has the runner's key in it, is never printed or passed on.
import type { Cesium3DTileset } from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPhotoreal } from "../src/photoreal/photoreal";
import { photorealTiles, requestPhotorealTileset } from "../src/scene/photoreal-tileset";
import { fakeStorage, GOOGLE } from "./photoreal-fixtures";

const TILESET = { asset: { version: "1.0" }, geometricError: 1000, root: { boundingVolume: { sphere: [0, 0, 0, 6400000] }, geometricError: 100, refine: "REPLACE" } };

async function tileset(): Promise<Cesium3DTileset> {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(TILESET), { status: 200 }));
  return requestPhotorealTileset(GOOGLE);
}

function fakeViewer() {
  const drawn: unknown[] = [];
  return {
    drawn,
    scene: {
      globe: { show: true },
      primitives: { add: (primitive: unknown) => drawn.push(primitive), remove: (primitive: unknown) => drawn.splice(drawn.indexOf(primitive), 1).length > 0 },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("photoreal imagery in the scene", () => {
  it("is not on screen until it is shown", async () => {
    const viewer = fakeViewer();

    photorealTiles(viewer, await tileset());

    expect(viewer.drawn).toEqual([]);
    expect(viewer.scene.globe.show).toBe(true);
  });

  it("leaves the plain ground in place until the first view has arrived, so the view is never blank", async () => {
    const viewer = fakeViewer();
    const imagery = await tileset();

    photorealTiles(viewer, imagery).show(() => undefined);

    expect(viewer.drawn).toEqual([imagery]);
    expect(viewer.scene.globe.show).toBe(true);
    imagery.initialTilesLoaded.raiseEvent();
    expect(viewer.scene.globe.show).toBe(false);
  });

  it("puts the plain ground back at once when removed, and takes the imagery apart after the frame", async () => {
    vi.useFakeTimers();
    const viewer = fakeViewer();
    const imagery = await tileset();
    const tiles = photorealTiles(viewer, imagery);
    tiles.show(() => undefined);
    imagery.initialTilesLoaded.raiseEvent();

    tiles.remove();

    expect(viewer.scene.globe.show).toBe(true);
    expect(imagery.show).toBe(false);
    vi.runAllTimers();
    expect(viewer.drawn).toEqual([]);
  });

  it("leaves the ground alone when removed without ever having hidden it: other imagery may be showing", async () => {
    const viewer = fakeViewer();
    const late = photorealTiles(viewer, await tileset());
    viewer.scene.globe.show = false; // hidden by the imagery that is actually on screen

    late.remove();

    expect(viewer.scene.globe.show).toBe(false);
  });

  it("doesn't hide the ground for imagery that was removed before its first view arrived", async () => {
    const viewer = fakeViewer();
    const imagery = await tileset();
    const tiles = photorealTiles(viewer, imagery);
    tiles.show(() => undefined);

    tiles.remove();
    imagery.initialTilesLoaded.raiseEvent();

    expect(viewer.scene.globe.show).toBe(true);
  });

  it("reports each tile as arrived or failed, and never prints or passes on a failed tile's address", async () => {
    // CesiumJS prints a failed tile's address to the console unless something listens for failed
    // tiles (Cesium3DTileset.js, handleTileFailure), and with a Google Maps key that address has the
    // key in it. So something must listen from the start, and must keep what it hears to itself.
    const printed = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((spy) => spy.mockImplementation(() => undefined));
    const viewer = fakeViewer();
    const imagery = await tileset();
    const heard: unknown[][] = [];

    const tiles = photorealTiles(viewer, imagery);
    expect(imagery.tileFailed.numberOfListeners).toBeGreaterThan(0); // even before it is shown

    tiles.show((...told) => heard.push(told));
    imagery.tileLoad.raiseEvent({});
    imagery.tileFailed.raiseEvent({ url: `https://tile.googleapis.com/v1/3dtiles/datasets/x.glb?key=${GOOGLE.secret}`, message: "Request has failed." });

    expect(heard).toEqual([[true], [false]]);
    expect(printed.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });
});

// Issue #22. Where the course is drawn follows the imagery, at exactly the moments the plain
// ground goes and comes back: at the road's own height while the photographed city is what the
// runner is looking at, draped on the ground the rest of the time. "In place" is what the scene
// tells whoever draws the course.
describe("where the course is drawn, as the imagery comes and goes", () => {
  it("stays draped until the imagery's first view has arrived: until then the plain ground is still what is on screen", async () => {
    const inPlace: boolean[] = [];
    const imagery = await tileset();

    photorealTiles(fakeViewer(), imagery, (now) => inPlace.push(now)).show(() => undefined);
    expect(inPlace).toEqual([]);

    imagery.initialTilesLoaded.raiseEvent();
    expect(inPlace).toEqual([true]);
  });

  it("goes back to draped the moment the imagery is removed, with the plain ground", async () => {
    const inPlace: boolean[] = [];
    const imagery = await tileset();
    const tiles = photorealTiles(fakeViewer(), imagery, (now) => inPlace.push(now));
    tiles.show(() => undefined);
    imagery.initialTilesLoaded.raiseEvent();

    tiles.remove();
    tiles.remove();

    expect(inPlace).toEqual([true, false]);
  });

  it("is never moved by imagery that was removed before its first view, or that never reached the screen", async () => {
    const inPlace: boolean[] = [];
    const imagery = await tileset();
    const tiles = photorealTiles(fakeViewer(), imagery, (now) => inPlace.push(now));
    tiles.show(() => undefined);

    tiles.remove();
    imagery.initialTilesLoaded.raiseEvent();
    photorealTiles(fakeViewer(), await tileset(), (now) => inPlace.push(now)).remove(); // a late load, thrown away

    expect(inPlace).toEqual([]);
  });

  describe("through everything the runner can do with photoreal", () => {
    /** The real controller and the real scene code, with a stand-in viewer and imagery whose first view arrives on request. */
    async function photoreal() {
      const viewer = fakeViewer();
      const placements: string[] = ["draped"];
      let latest: Cesium3DTileset | undefined;
      const controller = createPhotoreal({
        storage: fakeStorage(),
        loadTiles: async () => {
          const imagery = (latest = await tileset());
          return photorealTiles(viewer, imagery, (inPlace) => placements.push(inPlace ? "road-height" : "draped"));
        },
      });
      return { controller, placements, firstViewArrives: () => latest?.initialTilesLoaded.raiseEvent(), tileFails: () => latest?.tileFailed.raiseEvent({ message: "Request has failed." }), tileArrives: () => latest?.tileLoad.raiseEvent({}) };
    }
    const last = (placements: string[]) => placements[placements.length - 1];

    it("turned on, then off, then on again", async () => {
      const { controller, placements, firstViewArrives } = await photoreal();

      await controller.useKey(GOOGLE.secret);
      expect(last(placements)).toBe("draped"); // accepted, but the map is still what is on screen
      firstViewArrives();
      expect(last(placements)).toBe("road-height");
      controller.turnOff();
      expect(last(placements)).toBe("draped");
      await controller.turnOn();
      firstViewArrives();
      expect(last(placements)).toBe("road-height");
    });

    it("the imagery stops arriving (D44): back on the keyless map, and the line is draped on it", async () => {
      const { controller, placements, firstViewArrives, tileArrives, tileFails } = await photoreal();
      await controller.useKey(GOOGLE.secret);
      firstViewArrives();
      tileArrives();

      for (let i = 0; i < 8; i += 1) tileFails();

      expect(controller.state).toMatchObject({ look: "keyless", problem: "tiles-failing" });
      expect(last(placements)).toBe("draped");
    });

    it("the provider refuses the key: there is never any imagery to take the ground's place, so nothing can move the line", async () => {
      const viewer = fakeViewer();
      const controller = createPhotoreal({ storage: fakeStorage(), loadTiles: async () => Promise.reject(Object.assign(new Error("no"), { statusCode: 403 })) });

      await controller.useKey(GOOGLE.secret);

      expect(controller.state).toMatchObject({ look: "keyless", problem: "refused" });
      expect(viewer.drawn).toEqual([]);
      expect(viewer.scene.globe.show).toBe(true);
    });

    it("Forget my key", async () => {
      const { controller, placements, firstViewArrives } = await photoreal();
      await controller.useKey(GOOGLE.secret);
      firstViewArrives();

      controller.forgetKey();

      expect(last(placements)).toBe("draped");
    });

    it("turned off while it was still loading: the first view of imagery nobody wants moves nothing", async () => {
      const { controller, placements, firstViewArrives } = await photoreal();
      const loading = controller.useKey(GOOGLE.secret);
      controller.turnOff();
      await loading;

      firstViewArrives();

      expect(placements).toEqual(["draped"]);
    });
  });
});
