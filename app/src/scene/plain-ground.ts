// The ground of the keyless map when its open terrain can't be had. The terrain service is
// best-effort, with no promise of being up (PLAN.md D16). CesiumJS draws no ground at all while
// it waits for a terrain service to answer, so without this, one that never answers leaves the
// map black for good, and the course line with it, which is draped on that ground. The same goes
// for a service that answers and then fails one of its top tiles: a tile deeper down is filled in
// from the one above it, but a top tile has none above it, and CesiumJS gives up on it for good.
// With this the ground is then the plain ellipsoid: flat, but there, with the map and the course
// on it. The strip, the layers and the Ride never needed the terrain to begin with (issue #8).
import { EllipsoidTerrainProvider, type Terrain, type TerrainProvider, type TileProviderError } from "cesium";

export function plainGroundIfTerrainFails(terrain: Terrain, globe: { terrainProvider: TerrainProvider | undefined }): void {
  const plainGround = () => {
    globe.terrainProvider = new EllipsoidTerrainProvider();
  };
  // Listening also keeps CesiumJS from printing the failure to the console: it is handled here.
  terrain.errorEvent.addEventListener(plainGround);
  terrain.readyEvent.addEventListener((service) => {
    service.errorEvent.addEventListener((failed: TileProviderError) => {
      if (failed.level === 0) plainGround();
    });
  });
}
