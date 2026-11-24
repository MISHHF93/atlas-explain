/**
 * One local address for everything: `npm run dev` serves the site, the web app and the owner page at
 * http://127.0.0.1:5173, and the connector Worker (src/mcp/worker.ts) behind the same address. The
 * Worker runs under `wrangler dev` on an internal port that nobody needs to open; the dev server
 * forwards the Worker's paths to it. Set ATLAS_DEV_WORKER=0 to run the front end alone.
 *
 * Locally the Worker has its own empty data store, so the site and app keep reading the published
 * data from the live Worker, as they always have; the local Worker is for trying the connector.
 */
import { spawn, type ChildProcess } from "node:child_process";

/** Where the Worker listens inside this computer. Not an address to open: use 127.0.0.1:5173. */
export const DEV_WORKER_PORT = 8787;
/** The Worker's own paths, forwarded from the dev server. Everything else is the site and the app. */
export const WORKER_PATHS = ["/mcp", "/health", "/api/v1", "/admin/stats", "/admin/overview"] as const;

export function devWorker(): {
  name: string;
  apply: "serve";
  config: () => { server: { proxy: Record<string, { target: string; changeOrigin: boolean }> } };
  configureServer: (server: { httpServer?: { once: (event: string, fn: () => void) => void } | null; config: { logger: { info: (m: string) => void } } }) => void;
} {
  let child: ChildProcess | null = null;
  // Off under the test runner (it builds a Vite server too) and when asked.
  const enabled = process.env.ATLAS_DEV_WORKER !== "0" && !process.env.VITEST;
  const stop = () => {
    if (child && !child.killed) child.kill();
    child = null;
  };
  return {
    name: "atlas-dev-worker",
    apply: "serve",
    config: () => ({
      server: {
        proxy: enabled ? Object.fromEntries(WORKER_PATHS.map((p) => [p, { target: `http://127.0.0.1:${DEV_WORKER_PORT}`, changeOrigin: true }])) : {},
      },
    }),
    configureServer: (server) => {
      if (!enabled) return;
      // A fixed command (no user input), run through the shell so Windows finds npx; wrangler is a pinned devDependency.
      child = spawn(`npx wrangler dev --ip 127.0.0.1 --port ${DEV_WORKER_PORT} --log-level error`, {
        stdio: ["ignore", "inherit", "inherit"],
        shell: true,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      });
      child.on("exit", (code) => {
        if (code) server.config.logger.info(`  connector Worker stopped (exit ${code}); the site and app keep working.`);
      });
      server.httpServer?.once("close", stop);
      process.once("exit", stop);
      server.config.logger.info(`  connector: http://127.0.0.1:5173/mcp (the Worker runs behind this address)`);
    },
  };
}
