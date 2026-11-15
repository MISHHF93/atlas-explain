import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Checks that the hosted MCP server (src/mcp/worker.ts) bundles for Cloudflare Workers: one
 * file, no Node built-ins, no runtime dependencies. release:check runs it; the output in
 * mcp-dist/ is not committed or published (wrangler bundles the same source on deploy).
 */
export default defineConfig({
  // The website's public files (images, sitemap) don't belong in the server's bundle.
  publicDir: false,
  ssr: { target: "webworker", noExternal: true },
  build: {
    ssr: resolve("src/mcp/worker.ts"),
    outDir: "mcp-dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    rolldownOptions: {
      output: { entryFileNames: "worker.js", format: "es" },
    },
  },
});
