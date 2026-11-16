import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { firebaseChunkGroups } from "./chunking.config";
import { applySiteFrame } from "./src/site/frame";
import { rewriteFor, type HostingRewrite } from "./src/site/hosting-routes";

/** The public pages share one header and footer (src/site/frame.ts); each page only holds markers. */
const siteFrame = {
  name: "atlas-site-frame",
  transformIndexHtml: (html: string) => (/<!--\s*site:header/.test(html) ? applySiteFrame(html) : html),
};

/**
 * The live site's routes, locally: the dev and preview servers apply the same rewrites as Firebase
 * Hosting, read from firebase.json, so /signin, /start, /app/learn or /connect open the same page
 * here as on atlas-explain.web.app. Firebase is the one source; nothing is listed twice.
 */
const hostingRewrites = (JSON.parse(readFileSync("firebase.json", "utf8")) as { hosting: { rewrites: HostingRewrite[] } }).hosting.rewrites;
type Next = () => void;
type Req = { url?: string };
const rewrite = (req: Req, _res: unknown, next: Next) => {
  const [path, query] = (req.url ?? "/").split("?");
  const to = path && !path.includes(".") ? rewriteFor(path, hostingRewrites) : null;
  if (to) req.url = to + (query ? `?${query}` : "");
  next();
};
const siteRoutes = {
  name: "atlas-site-routes",
  configureServer: (server: { middlewares: { use: (fn: typeof rewrite) => void } }): void => {
    server.middlewares.use(rewrite);
  },
  configurePreviewServer: (server: { middlewares: { use: (fn: typeof rewrite) => void } }): void => {
    server.middlewares.use(rewrite);
  },
};

export default defineConfig({
  plugins: [siteFrame, siteRoutes],
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
