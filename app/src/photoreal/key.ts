// The runner's own key: what lets Photoreal be shown (PLAN.md D3, D30; how it is handled is D43). It is either a Google Maps
// key or a Cesium ion token, and the two must never be mixed up, because each is a secret that
// belongs to one provider. So the app tells them apart by shape, says which it found and where it
// will be sent, and refuses anything it doesn't recognize rather than guess.

export type KeyProvider = "google" | "cesium-ion";

export interface OwnKey {
  provider: KeyProvider;
  secret: string;
}

export const KEY_PROVIDERS: Record<KeyProvider, { keyName: string; noun: string; company: string; sentTo: string }> = {
  // The Map Tiles API's host. The key travels as ?key=… on requests to it and nowhere else.
  google: { keyName: "Google Maps key", noun: "key", company: "Google", sentTo: "tile.googleapis.com" },
  // Cesium ion's API host. ion answers with where the tiles are and a short-lived key of its own
  // for fetching them, so the runner's token itself never goes to Google.
  "cesium-ion": { keyName: "Cesium ion token", noun: "token", company: "Cesium", sentTo: "api.cesium.com" },
};

// A Google Maps key: "AIza" and then 35 letters, digits, dashes or underscores. The length is left
// loose: a wrong guess here only means Google refuses the key, and the runner is told so.
const GOOGLE_KEY = /^AIza[0-9A-Za-z_-]{30,}$/;
// A Cesium ion token is a JSON Web Token: three dot-separated runs, the first two starting "eyJ".
const ION_TOKEN = /^eyJ[0-9A-Za-z_-]+\.eyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+$/;

/** Whose key this is, or null when it is neither kind. Spaces and quotes around a paste are ignored. */
export function recognizeKey(pasted: string): OwnKey | null {
  const secret = pasted.trim().replace(/^["']|["']$/g, "");
  if (GOOGLE_KEY.test(secret)) return { provider: "google", secret };
  if (ION_TOKEN.test(secret)) return { provider: "cesium-ion", secret };
  return null;
}
