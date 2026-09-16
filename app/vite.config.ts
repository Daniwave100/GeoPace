import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

// CesiumJS ships web workers, images, and widget CSS that must be served as plain files.
const cesiumBuild = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesium";

export default defineConfig({
  // Course Bundles written by the pipeline are served as-is: data/derived/berlin/course-bundle.json
  // is fetched from /berlin/course-bundle.json. The app never needs Python to run.
  publicDir: "../data/derived",
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [
    viteStaticCopy({
      targets: ["ThirdParty", "Workers", "Assets", "Widgets"].map((dir) => ({
        src: `${cesiumBuild}/${dir}`,
        rename: { stripBase: 4 }, // node_modules/cesium/Build/Cesium/Workers -> cesium/Workers
        dest: cesiumBaseUrl,
      })),
    }),
  ],
  server: {
    // The shared Course Bundle schema lives at the repo root, outside app/.
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
  },
});
