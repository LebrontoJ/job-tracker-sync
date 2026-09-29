import { defineConfig } from "vite";

// Content scripts cannot be ES modules, so this bundles src/content/gmail.ts
// (and everything it imports) into a single IIFE next to the main build output.
export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: mode === "development",
    minify: mode !== "development",
    target: "es2022",
    lib: {
      entry: "src/content/gmail.ts",
      formats: ["iife"],
      name: "JobTrackerContent",
      fileName: () => "content.js",
    },
  },
}));
