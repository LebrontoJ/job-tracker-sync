import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import { buildManifest } from "./manifest.config.ts";

const PLACEHOLDER_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";

function manifestPlugin(clientId: string, key?: string): Plugin {
  return {
    name: "emit-manifest",
    generateBundle() {
      if (clientId === PLACEHOLDER_CLIENT_ID) {
        this.warn(
          "VITE_OAUTH_CLIENT_ID is not set - Google sign-in will not work. See .env.example.",
        );
      }
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(buildManifest({ clientId, ...(key ? { key } : {}) }), null, 2),
      });
    },
  };
}

// Background worker + side panel + options page. The Gmail content script must
// be a self-contained classic script, so it is built separately
// (vite.content.config.ts).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const dev = mode === "development";

  return {
    plugins: [
      react(),
      manifestPlugin(env.VITE_OAUTH_CLIENT_ID || PLACEHOLDER_CLIENT_ID, env.VITE_EXTENSION_KEY),
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: dev,
      minify: !dev,
      target: "es2022",
      rollupOptions: {
        input: {
          background: "src/background/index.ts",
          sidepanel: "sidepanel.html",
          options: "options.html",
        },
        output: {
          // The manifest refers to background.js by name.
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
