// Seam: the real CesiumJS request code on one side, the network on the other. `fetch` is replaced
// by a recorder, so this sees every request the app would make for photoreal imagery, and nothing
// leaves the machine. What must hold (PLAN.md D3, §9): the runner's own key appears only in
// requests to the provider it belongs to. The keys are invented (see photoreal-key.test.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEY_PROVIDERS, type OwnKey } from "../src/photoreal/key";
import { requestPhotorealTileset } from "../src/scene/photoreal-tileset";

const GOOGLE: OwnKey = { provider: "google", secret: "AIza" + "Sy-invented_0123456789-abcdefghijklmnop".slice(0, 35) };
const ION: OwnKey = { provider: "cesium-ion", secret: ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "pZCI6MX0", "invented-signature"].join(".") };

/** The smallest tileset CesiumJS will accept: one empty tile around the whole Earth. */
const TILESET = { asset: { version: "1.0" }, geometricError: 1000, root: { boundingVolume: { sphere: [0, 0, 0, 6400000] }, geometricError: 100, refine: "REPLACE" } };
/** What Cesium ion answers for Google's photoreal asset: where the tiles are, with a key of ion's own. */
const ION_ENDPOINT = { type: "3DTILES", externalType: "3DTILES", options: { url: "https://tile.googleapis.com/v1/3dtiles/root.json?key=ions-own-key" }, attributions: [] };

interface Seen {
  host: string;
  everything: string; // the address and every header, as one string to search
}

function recordRequests(answer: (url: URL) => Response): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (address: string | URL, init?: RequestInit) => {
    const url = new URL(String(address));
    seen.push({ host: url.host, everything: `${url.href} ${JSON.stringify(init?.headers ?? {})}` });
    return answer(url);
  });
  return seen;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("requests for photoreal imagery", () => {
  it("sends a Google Maps key to Google's tile server and nowhere else", async () => {
    const seen = recordRequests(() => json(TILESET));

    await requestPhotorealTileset(GOOGLE);

    expect(seen.map((request) => request.host)).toEqual([KEY_PROVIDERS.google.sentTo]);
    expect(seen[0].everything).toContain(GOOGLE.secret);
  });

  it("sends a Cesium ion token to Cesium and nowhere else: Google's tile server never sees it", async () => {
    const seen = recordRequests((url) => json(url.host === "api.cesium.com" ? ION_ENDPOINT : TILESET));

    await requestPhotorealTileset(ION);

    expect(seen.map((request) => request.host)).toEqual([KEY_PROVIDERS["cesium-ion"].sentTo, "tile.googleapis.com"]);
    expect(seen[0].everything).toContain(ION.secret);
    expect(seen[1].everything).not.toContain(ION.secret);
  });

  it("passes on the provider's refusal, status and all, without the key in the message", async () => {
    recordRequests(() => json({ error: { code: 400, message: "API key not valid." } }, 400));

    const refusal = await requestPhotorealTileset(GOOGLE).catch((answer: unknown) => answer);

    expect(refusal).toMatchObject({ statusCode: 400 });
    expect(String(refusal)).not.toContain(GOOGLE.secret);
  });

  it("shows the imagery's credits on the map itself, not folded away behind a link", async () => {
    recordRequests((url) => json(url.host === "api.cesium.com" ? ION_ENDPOINT : TILESET));

    for (const key of [GOOGLE, ION]) {
      expect((await requestPhotorealTileset(key)).showCreditsOnScreen, key.provider).toBe(true);
    }
  });
});
