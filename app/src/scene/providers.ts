// Keyless map providers. Terms checked 2026-09-16 (see PLAN.md §5). No API keys, ever.

// ⛔ No basemap. Nothing is drawn on the ground: with no key the app shows the city's own
// buildings on the design's paper (issue #38), and with a key it shows Google's photographed
// city. OpenStreetMap's standard tiles were the ground until 2026-09-20; OpenStreetMap is still
// credited by each Course Bundle, for the course's streets and its bridges, which are its data.

export const TERRAIN = {
  // Re:Earth Terrain: quantized-mesh built from Mapterhorn (CC BY 4.0) + EGM2008 geoid, no key.
  // Free with no signup or key; best effort with no uptime guarantee. https://terrain.reearth.land/
  // Its layer.json carries the full attribution, which Cesium shows on the map automatically.
  url: "https://terrain.reearth.land/cesium-mesh/ellipsoid",
};

/** Credits for everything the app itself draws, shown in the footer next to the bundle's own. */
export const PROVIDER_ATTRIBUTIONS = [
  { text: "Terrain: Re:Earth Terrain · Mapterhorn (CC BY 4.0)", url: "https://mapterhorn.com/attribution" },
  { text: "3D engine: CesiumJS", url: "https://cesium.com/platform/cesiumjs/" },
  // Only ever on screen with the runner's own key. Google's logo and each tile's data credits are shown on the map itself.
  { text: "Photoreal, with your own key: Google Photorealistic 3D Tiles, direct or through Cesium ion", url: "https://developers.google.com/maps/documentation/tile/3d-tiles" },
];
