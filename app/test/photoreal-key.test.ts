// Seam: what the runner pastes into the photoreal box -> whose key it is, and so where it may be sent.
// The keys here are invented, and built from pieces so that no file in the repo holds a key-shaped string.
import { describe, expect, it } from "vitest";
import { KEY_PROVIDERS, recognizeKey } from "../src/photoreal/key";

const GOOGLE_KEY = "AIza" + "Sy-invented_0123456789-abcdefghijklmnop".slice(0, 35);
const ION_TOKEN = ["eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJ" + "qdGkiOiJpbnZlbnRlZCIsImlkIjoxfQ", "invented-signature_0123456789"].join(".");

describe("recognizing an own key", () => {
  it("knows a Google Maps key by its shape", () => {
    expect(recognizeKey(GOOGLE_KEY)).toEqual({ provider: "google", secret: GOOGLE_KEY });
  });

  it("knows a Cesium ion token by its shape", () => {
    expect(recognizeKey(ION_TOKEN)).toEqual({ provider: "cesium-ion", secret: ION_TOKEN });
  });

  it("forgives what comes along with a paste: spaces, a line break, quotes", () => {
    expect(recognizeKey(`  ${GOOGLE_KEY}\n`)).toEqual({ provider: "google", secret: GOOGLE_KEY });
    expect(recognizeKey(`"${ION_TOKEN}"`)).toEqual({ provider: "cesium-ion", secret: ION_TOKEN });
  });

  it("refuses anything else, rather than guess which provider to send it to", () => {
    for (const pasted of ["", "   ", "hello", "my key is " + GOOGLE_KEY, GOOGLE_KEY.slice(0, 12), "eyJ.not.a-token", ION_TOKEN.replace(".", " ")]) {
      expect(recognizeKey(pasted), JSON.stringify(pasted)).toBeNull();
    }
  });

  it("says, for each provider, the one host its key is sent to", () => {
    expect(KEY_PROVIDERS.google.sentTo).toBe("tile.googleapis.com");
    expect(KEY_PROVIDERS["cesium-ion"].sentTo).toBe("api.cesium.com");
  });
});
