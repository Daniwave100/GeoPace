// Keyless map providers. Terms checked 2026-09-16 (see PLAN.md §5). No API keys, ever.

export const BASEMAP = {
  // OpenStreetMap standard tiles. Tile usage policy: visible attribution, no bulk or offline
  // pre-fetching, browser Referer must reach the server. https://operations.osmfoundation.org/policies/tiles/
  url: "https://tile.openstreetmap.org/",
  creditHtml: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  maximumLevel: 19,
};

export const TERRAIN = {
  // Re:Earth Terrain: quantized-mesh built from Mapterhorn (CC BY 4.0) + EGM2008 geoid, no key.
  // Free with no signup or key; best effort with no uptime guarantee. https://terrain.reearth.land/
  // Its layer.json carries the full attribution, which Cesium shows on the map automatically.
  url: "https://terrain.reearth.land/cesium-mesh/ellipsoid",
};

/** Credits for everything the app itself draws, shown in the footer next to the bundle's own. */
export const PROVIDER_ATTRIBUTIONS = [
  { text: "Map: © OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
  { text: "Terrain: Re:Earth Terrain · Mapterhorn (CC BY 4.0)", url: "https://mapterhorn.com/attribution" },
  { text: "3D engine: CesiumJS", url: "https://cesium.com/platform/cesiumjs/" },
];
