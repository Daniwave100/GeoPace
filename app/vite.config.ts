import { resolve } from "node:path";
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
  build: {
    rollupOptions: {
      // The app, plus the design mockups (#4): pages of their own, so none of their fonts or
      // styles end up in the app's bundle.
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        mockups: resolve(import.meta.dirname, "mockups/index.html"),
        roadbook: resolve(import.meta.dirname, "mockups/roadbook.html"),
        poster: resolve(import.meta.dirname, "mockups/poster.html"),
        instrument: resolve(import.meta.dirname, "mockups/instrument.html"),
      },
    },
  },
  server: {
    // The shared Course Bundle schema lives at the repo root, outside app/.
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
  },
});
