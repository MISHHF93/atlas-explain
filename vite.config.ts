import { defineConfig } from "vitest/config";
import { firebaseChunkGroups } from "./chunking.config";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      // Public site pages are static HTML with a tiny script; the app is one entry (app.html) served at /app/**.
      // bridge.html is the hidden page the Chrome extension embeds for App Check-protected cloud calls.
      input: {
        site: "index.html",
        howItWorks: "how-it-works.html",
        privacy: "privacy.html",
        terms: "terms.html",
        support: "support.html",
        notFound: "404.html",
        app: "app.html",
        bridge: "bridge.html",
      },
      output: {
        codeSplitting: { groups: firebaseChunkGroups },
      },
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
