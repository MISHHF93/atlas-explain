// A tiny Chrome DevTools Protocol driver for the store images. No dependencies: it starts the Chrome
// already on this computer (or CHROME=path) in headless mode and talks to it over a WebSocket (Node 22+).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchChrome(port = 9333) {
  const exe = CANDIDATES.find((path) => existsSync(path));
  if (!exe) throw new Error("Chrome not found. Set CHROME to its path.");
  const profile = mkdtempSync(join(tmpdir(), "atlas-store-"));
  const proc = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await sleep(200);
    }
  }
  return {
    /** Opens a tab at width×height (CSS px) and scale, and returns helpers for it. */
    async open(width, height, scale = 1) {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve) => (ws.onopen = resolve));
      let id = 0;
      const pending = new Map();
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      };
      const send = (method, params = {}) => new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
      });
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
      await send("Page.enable");
      return {
        async goto(url, waitMs = 1500) {
          await send("Page.navigate", { url });
          await sleep(waitMs);
        },
        async eval(expression) {
          const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
          return res.result?.result?.value;
        },
        /** An opaque PNG: the store wants 24-bit images without alpha. */
        async png() {
          await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 255, g: 255, b: 255, a: 1 } });
          const shot = await send("Page.captureScreenshot", { format: "png" });
          return Buffer.from(shot.result.data, "base64");
        },
        async close() {
          ws.close();
          await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
        },
      };
    },
    async close() {
      proc.kill();
      await sleep(500);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold the profile for a moment; it lives in the temp folder.
      }
    },
  };
}
