import { defineConfig } from "vitest/config";
import { firebaseChunkGroups } from "./chunking.config";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
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
