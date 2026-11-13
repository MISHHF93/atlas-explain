import { resolve } from "node:path";
import { defineConfig } from "vite";
import { firebaseChunkGroups } from "./chunking.config";

export default defineConfig({
  root: resolve("extension"),
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Firebase loads lazily for cloud fallback only, so the popup itself stays small.
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      input: {
        popup: resolve("extension/popup.html"),
        background: resolve("extension/src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        codeSplitting: { groups: firebaseChunkGroups },
      },
    },
  },
});
