// Captures the real popup and side panel for the store images and the website.
// The popup's preview states (?demo=, ?tab=, ?engine=) only work in a development build, so run it against
// the extension dev server:
//   npx vite --config vite.extension.config.ts --port 4780 --strictPort
//   node store/src/capture.mjs        (writes store/src/shots/*.png and public/shots/*.png)
// The Assets shot loads live prices from CoinGecko and official figures from the data site, so it needs
// the internet; nothing in it is made up.
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "..", "public", "shots");
const popup = process.env.POPUP_URL ?? "http://localhost:4780/popup.html";

const shots = [
  // name, query, width, height, wait (ms)
  ["popup-answer", "demo=answer&engine=ready&theme=light", 360, 600, 2500],
  ["popup-explain", "engine=ready&theme=light", 360, 600, 2500],
  ["popup-learn", "tab=glossary&engine=ready&theme=light", 360, 600, 2500],
  ["popup-assets", "tab=assets&engine=ready&theme=light", 360, 600, 9000],
  ["panel-answer", "demo=answer&view=panel&engine=ready&theme=light", 420, 800, 2500],
];

const chrome = await launchChrome();
try {
  for (const [name, query, w, h, wait] of shots) {
    const tab = await chrome.open(w, h, 2);
    // As a plain page (no Chrome APIs) the popup skips the first-run steps and reads no stored history.
    await tab.goto(`${popup}?${query}`, wait);
    // Never save an error page: stop if the popup did not render.
    if (!(await tab.eval(`Boolean(document.querySelector(".bar"))`))) throw new Error(`${name}: the popup did not load from ${popup}`);
    writeFileSync(join(here, "shots", `${name}.png`), await tab.png());
    console.log(name, `${w * 2}x${h * 2}`);
    await tab.close();
  }
} finally {
  await chrome.close();
}
copyFileSync(join(here, "shots", "popup-answer.png"), join(site, "popup-answer.png"));
copyFileSync(join(here, "shots", "popup-explain.png"), join(site, "popup-explain.png"));
copyFileSync(join(here, "shots", "panel-answer.png"), join(site, "sidepanel.png"));
