// Google's Photorealistic 3D Tiles in the scene, with the runner's own key: asked for directly from
// Google with a Google Maps key, or through Cesium ion with an ion token. This is the only code that
// hands the key to anything, and the key is handed over explicitly each time. It is never set as a
// CesiumJS default (`Ion.defaultAccessToken`, `GoogleMaps.defaultApiKey`), because a default is sent
// along by any part of CesiumJS that happens to reach for it (PLAN.md D43).
//
// Google's terms (PLAN.md D5, §9): the imagery is for looking at only. Nothing here or anywhere
// else stores it, works anything out from it, or fetches tiles the camera isn't looking at. The
// course line and the runner are our own things drawn over it, which Google's policies allow. They
// are never rested on, or measured against, the imagery's surface: while it is in place they are
// at road height from our own survey data, and while it is still arriving they stay draped on our
// own open terrain (scene/placement.ts, issue #22).
import { Cesium3DTileset, createGooglePhotorealistic3DTileset, IonResource } from "cesium";
import type { OwnKey } from "../photoreal/key";
import type { PhotorealTiles } from "../photoreal/photoreal";

/** As much of the CesiumJS viewer as the imagery touches: the plain ground, and the list of what is drawn. */
export interface SceneForPhotoreal {
  scene: {
    globe: { show: boolean };
    primitives: { add(primitive: Cesium3DTileset): unknown; remove(primitive: Cesium3DTileset): boolean };
  };
}

/** Google Photorealistic 3D Tiles as Cesium ion lists them: the id CesiumJS itself uses in createGooglePhotorealistic3DTileset. */
const ION_ASSET_ID = 2275207;

const OPTIONS: Cesium3DTileset.ConstructorOptions = {
  // Google requires the data providers' names on the map, along the bottom, not behind a link.
  // https://developers.google.com/maps/documentation/tile/policies
  showCreditsOnScreen: true,
  // Keeps the camera out of the imagery: CesiumJS won't let it go into or under a surface it may collide with.
  enableCollision: true,
  // How much imagery CesiumJS keeps in memory while it is on screen: the sizes CesiumJS picks for
  // these tiles, set here so both kinds of key behave alike. Memory only; gone when the page closes.
  cacheBytes: 1536 * 1024 * 1024,
  maximumCacheOverflowBytes: 1024 * 1024 * 1024,
};

/** Rejects with CesiumJS's `RequestErrorEvent` (it carries the HTTP `statusCode`) when the provider says no. */
export async function requestPhotorealTileset(key: OwnKey): Promise<Cesium3DTileset> {
  if (key.provider === "google") {
    // The app has no place search, so the rule that only Google's geocoder may sit beside these tiles is met.
    return createGooglePhotorealistic3DTileset({ key: key.secret, onlyUsingWithGoogleGeocoder: true }, { ...OPTIONS });
  }
  // ion answers with where the tiles are, a short-lived key of its own, and the credits to show.
  const resource = await IonResource.fromAssetId(ION_ASSET_ID, { accessToken: key.secret });
  return Cesium3DTileset.fromUrl(resource, { ...OPTIONS });
}

/** One Load: ask the provider for the imagery, ready to be shown in this viewer. `onInPlace` as for `photorealTiles`. */
export async function loadPhotorealTiles(viewer: SceneForPhotoreal, key: OwnKey, onInPlace: (inPlace: boolean) => void): Promise<PhotorealTiles> {
  return photorealTiles(viewer, await requestPhotorealTileset(key), onInPlace);
}

/**
 * The imagery, ready to go into the scene. The keyless map stays where it is until the imagery's
 * first view has fully arrived, and comes straight back when the imagery is removed, so the view
 * is never blank (PLAN.md D44).
 *
 * `onInPlace` is told true when this imagery takes the plain ground's place, and false when it
 * gives it back: the two moments at which what the runner is looking at changes. Whoever draws
 * the course uses them to draw it at the road's height over the imagery and draped on the plain
 * ground (issue #22). Imagery that never took the ground's place never calls it.
 */
export function photorealTiles(viewer: SceneForPhotoreal, tileset: Cesium3DTileset, onInPlace: (inPlace: boolean) => void = () => undefined): PhotorealTiles {
  const globe = viewer.scene.globe;
  let onTile: (arrived: boolean) => void = () => undefined;
  let hidTheGround = false;
  let removed = false;

  // Listening from the very start, and deliberately deaf to what CesiumJS says about a failed tile:
  // with no listener CesiumJS prints the tile's address to the console, and that address has the
  // runner's key in it. Nothing here reads, shows, logs or passes on what it is handed.
  tileset.tileFailed.addEventListener(() => onTile(false));
  tileset.tileLoad.addEventListener(() => onTile(true));
  // Google's imagery has its own ground. Left on, the plain ground pokes through it in patches.
  tileset.initialTilesLoaded.addEventListener(() => {
    if (removed || hidTheGround) return;
    globe.show = false;
    hidTheGround = true;
    onInPlace(true);
  });

  return {
    show(listener) {
      onTile = listener;
      viewer.scene.primitives.add(tileset);
    },
    remove() {
      if (removed) return;
      removed = true;
      onTile = () => undefined;
      // Only what this imagery took away is put back: other imagery may be the one on screen.
      if (hidTheGround) {
        globe.show = true;
        onInPlace(false);
      }
      tileset.show = false;
      // A tile can fail in the middle of drawing a frame. Taking the imagery apart waits until that frame is done.
      setTimeout(() => viewer.scene.primitives.remove(tileset), 0);
    },
  };
}

