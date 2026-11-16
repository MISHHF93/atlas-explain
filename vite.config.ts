import { defineConfig } from "vitest/config";
import { firebaseChunkGroups } from "./chunking.config";
import { applySiteFrame } from "./src/site/frame";

/** The public pages share one header and footer (src/site/frame.ts); each page only holds markers. */
const siteFrame = {
  name: "atlas-site-frame",
  transformIndexHtml: (html: string) => (/<!--\s*site:header/.test(html) ? applySiteFrame(html) : html),
};

export default defineConfig({
  plugins: [siteFrame],
  build: {
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      // Public site pages are static HTML with a tiny script; the app is one entry (app.html) served at /app/**.
      input: {
        site: "index.html",
        howItsBuilt: "how-its-built.html",
        privacy: "privacy.html",
        terms: "terms.html",
        support: "support.html",
        connect: "connect.html",
        notFound: "404.html",
        app: "app.html",
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
