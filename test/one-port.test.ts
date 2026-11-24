import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEV_WORKER_PORT, WORKER_PATHS, devWorker } from "../src/site/dev-worker";

// One repository, one local address: the site, the web app, the owner page and the connector
// Worker all answer at http://127.0.0.1:5173 in development (24 Nov 2026).
describe("one local address", () => {
  it("serves development and previews on 127.0.0.1:5173 only", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(vite).toContain('const LOCAL = { host: "127.0.0.1", port: 5173, strictPort: true } as const;');
    expect(vite).toMatch(/server: LOCAL,\r?\n\s*preview: LOCAL,/);
    expect(vite).toContain("plugins: [siteFrame, siteRoutes, devWorker()]");
  });

  it("forwards only the Worker's own paths to it, from the same address", () => {
    expect(WORKER_PATHS).toEqual(["/mcp", "/health", "/api/v1", "/admin/stats", "/admin/overview"]);
    const plugin = devWorker();
    expect(plugin.apply).toBe("serve");
    // Under the test runner the Worker is never started and nothing is forwarded.
    expect(plugin.config().server.proxy).toEqual({});
    expect(readFileSync("src/site/dev-worker.ts", "utf8")).toContain(`npx wrangler dev --ip 127.0.0.1 --port \${DEV_WORKER_PORT}`);
    expect(DEV_WORKER_PORT).toBe(8787);
  });

  it("talks to no other app on this computer", () => {
    for (const f of ["src/web/app.ts", "src/core/assets.ts", "src/core/price-provider.ts", "firebase.json"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/localhost:3000|127\.0\.0\.1:3000/);
    }
  });
});
