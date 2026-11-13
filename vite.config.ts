import { defineConfig } from "vitest/config";
import { firebaseChunkGroups } from "./chunking.config";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      // bridge.html is the hidden page the Chrome extension embeds for App Check-protected cloud calls.
      input: { main: "index.html", bridge: "bridge.html" },
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
