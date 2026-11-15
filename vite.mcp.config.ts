import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Builds the ATLAS Explain MCP server into one Node file, mcp/atlas-explain-mcp.mjs, so it can
 * reuse the app's own glossary, catalog and headline readers. No dependencies at runtime.
 */
export default defineConfig({
  // The website's public files (images, sitemap) don't belong in the server's folder.
  publicDir: false,
  build: {
    ssr: resolve("src/mcp/main.ts"),
    outDir: "mcp",
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rolldownOptions: {
      output: { entryFileNames: "atlas-explain-mcp.mjs", format: "es" },
    },
  },
});
