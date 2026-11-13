import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve("extension"),
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Firebase is a lazy chunk loaded only for cloud fallback, so the popup itself stays small.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        popup: resolve("extension/popup.html"),
        background: resolve("extension/src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
