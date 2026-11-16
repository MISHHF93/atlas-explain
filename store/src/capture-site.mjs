// Stills of the live website and web app for the README and docs/DEMO.md (docs/screenshots/).
// Captures https://atlas-explain.web.app as it is deployed, in headless Chrome at 2x. Live prices
// and headlines load from the real sources, so nothing in them is made up.
//   node store/src/capture-site.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, sleep } from "./cdp.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "screenshots");
const SITE = process.env.SITE_URL ?? "https://atlas-explain.web.app";

// name, path, width, height, wait (ms), and a check that the page rendered what we expect.
const shots = [
  ["site-home", "/", 1280, 800, 2500, `Boolean(document.querySelector(".hero-title"))`],
  ["site-connect", "/connect", 1280, 800, 2500, `document.querySelector("[data-mcp-url]")?.textContent.includes("/mcp")`],
  ["signin", "/signin", 1280, 800, 5000, `!document.querySelector(".signin-page")?.hidden`],
  // ?tab= skips the first-run steps; the app then opens at Explain.
  ["hosted-header", "/app?tab=explain", 1100, 150, 6000, `Boolean(document.querySelector(".bar .acct"))`],
  ["hosted-full", "/app/today?tab=today", 390, 760, 9000, `Boolean(document.querySelector("#panel-today"))`],
];

const chrome = await launchChrome(9338);
try {
  for (const [name, path, w, h, wait, check] of shots) {
    const tab = await chrome.open(w, h, 2);
    await tab.goto(`${SITE}${path}`, wait);
    if (!(await tab.eval(check))) throw new Error(`${name}: ${SITE}${path} did not render as expected`);
    // hosted-full shows the Today section, like the earlier still.
    if (name === "hosted-full") {
      await tab.eval(`document.querySelector(".wallet-body").scrollTop = document.querySelector("#panel-today").offsetTop - 8; true`);
      await sleep(800);
    }
    writeFileSync(join(out, `${name}.png`), await tab.png());
    console.log(name, `${w * 2}x${h * 2}`);
    await tab.close();
  }
} finally {
  await chrome.close();
}
