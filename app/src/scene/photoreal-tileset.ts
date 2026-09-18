// Asks for Google's Photorealistic 3D Tiles with the runner's own key: directly from Google with a
// Google Maps key, or through Cesium ion with an ion token. This is the only code that hands the
// key to anything, and the key is handed over explicitly each time. It is never set as a CesiumJS
// default (`Ion.defaultAccessToken`, `GoogleMaps.defaultApiKey`), because a default is sent along
// by any part of CesiumJS that happens to reach for it.
//
// Google's terms (PLAN.md D5, §9): the imagery is for looking at only. Nothing here or anywhere
// else stores it, reads heights or shapes out of it, or fetches tiles the camera isn't looking at.
import { Cesium3DTileset, createGooglePhotorealistic3DTileset, IonResource } from "cesium";
import type { OwnKey } from "../photoreal/key";

/** Google Photorealistic 3D Tiles as Cesium ion lists them: the id CesiumJS itself uses in createGooglePhotorealistic3DTileset. */
const ION_ASSET_ID = 2275207;

const OPTIONS: Cesium3DTileset.ConstructorOptions = {
  // Google requires the data providers' names on the map, along the bottom, not behind a link.
  // https://developers.google.com/maps/documentation/tile/policies
  showCreditsOnScreen: true,
  // Lets the course line and the runner sit on the imagery's surface once the plain ground is hidden.
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
