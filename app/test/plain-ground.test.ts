// Seam: the keyless map's open terrain <-> the ground CesiumJS draws. CesiumJS draws no ground at
// all while it waits for a terrain service, so one that can't be reached would leave the map
// black for good, and the draped course line with it (issue #8: a tile failure must leave the
// course on screen). The terrain here is a real CesiumJS one, given a service that answers or doesn't.
import { EllipsoidTerrainProvider, Terrain, type TerrainProvider, TileProviderError } from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plainGroundIfTerrainFails } from "../src/scene/plain-ground";

afterEach(() => vi.restoreAllMocks());

describe("the ground of the keyless map", () => {
  it("is the plain ellipsoid when the open terrain can't be reached, so the map and the draped course are still drawn", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const globe: { terrainProvider: TerrainProvider | undefined } = { terrainProvider: undefined }; // what CesiumJS leaves while it waits
    const terrain = new Terrain(Promise.reject(new Error("terrain.reearth.land can't be reached")));

    plainGroundIfTerrainFails(terrain, globe);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globe.terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
    expect(printed).not.toHaveBeenCalled(); // handled, not left for CesiumJS to print
  });

  it("is the plain ellipsoid too when the service answers but one of its top tiles fails: nothing can stand in for a tile that has no parent", async () => {
    const service = new EllipsoidTerrainProvider(); // stands in for the open terrain: what matters is its own report of failed tiles
    const globe: { terrainProvider: TerrainProvider | undefined } = { terrainProvider: service };
    const terrain = new Terrain(Promise.resolve(service));
    plainGroundIfTerrainFails(terrain, globe);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A tile deep in the tree fails: CesiumJS fills it in from the tile above it, and the ground stays.
    service.errorEvent.raiseEvent(new TileProviderError(service, "Failed to obtain terrain tile X: 301 Y: 384 Level: 9.", 301, 384, 9, 0));
    expect(globe.terrainProvider).toBe(service);

    // A top tile fails: CesiumJS gives up on it for good, and half the world, course included, has no ground.
    service.errorEvent.raiseEvent(new TileProviderError(service, "Failed to obtain terrain tile X: 0 Y: 0 Level: 0.", 0, 0, 0, 0));
    expect(globe.terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
    expect(globe.terrainProvider).not.toBe(service);
  });

  it("is left to the open terrain when that arrives", async () => {
    const globe: { terrainProvider: TerrainProvider | undefined } = { terrainProvider: undefined };
    const terrain = new Terrain(Promise.resolve(new EllipsoidTerrainProvider()));

    plainGroundIfTerrainFails(terrain, globe);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globe.terrainProvider).toBeUndefined(); // CesiumJS's own listener puts the terrain in; this one did nothing
  });
});
