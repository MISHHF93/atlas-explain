import { defineConfig } from "vitest/config";

/** Firestore rules tests: run inside `firebase emulators:exec` (see npm run test:rules). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/rules/**/*.rules.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
