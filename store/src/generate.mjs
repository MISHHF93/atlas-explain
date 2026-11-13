// Renders the Chrome Web Store listing images in store/ from real extension screenshots.
// Not part of the build. Needs Playwright with Chromium on the machine that runs it:
//   1. npm run build && npm run build:extension, then serve dist/ on :4173 and extension/dist/ on :4174
//   2. capture store/src/shots/*.png (popup at 360x600 @2x: ?demo=answer&engine=ready, ?engine=ready,
//      ?tab=glossary&engine=ready; side panel at 420x800 @2x: ?demo=answer&view=panel&engine=ready)
//   3. node store/src/generate.mjs   (writes store/*.png, 24-bit PNG without alpha)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..");
const img = (name) => `data:image/png;base64,${readFileSync(join(here, "shots", `${name}.png`)).toString("base64")}`;
const logo = `data:image/svg+xml;base64,${readFileSync(join(here, "..", "..", "public", "logo.svg")).toString("base64")}`;
const demoPage = process.env.DEMO_URL ?? "http://127.0.0.1:4173/demo/trading-terms.html";

// Brand values mirror src/brand/tokens.css (light theme).
const css = `
  * { box-sizing: border-box; margin: 0; }
  body { width: 100vw; height: 100vh; overflow: hidden; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1c1915;
    background: radial-gradient(70% 70% at 15% 10%, rgba(12,107,94,0.16), transparent 70%), #f4f1ea; }
  .wrap { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 64px; height: 100%; padding: 0 88px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; margin-bottom: 28px; }
  .brand img { width: 44px; height: 44px; border-radius: 12px; }
  .brand b { letter-spacing: 0.08em; }
  h1 { font-family: Georgia, "Iowan Old Style", "DejaVu Serif", serif; font-weight: 600; font-size: 54px; line-height: 1.08; letter-spacing: -0.01em; }
  h1 span { color: #0c6b5e; }
  p.lede { margin-top: 22px; font-size: 22px; line-height: 1.5; color: #5c564c; max-width: 560px; }
  .chips { display: flex; gap: 10px; margin-top: 28px; flex-wrap: wrap; }
  .chip { padding: 8px 14px; border-radius: 999px; background: rgba(12,107,94,0.12); color: #0c6b5e; font-weight: 700; font-size: 16px; }
  .device { width: 360px; border-radius: 24px; overflow: hidden; border: 1px solid #e3dcd0; box-shadow: 0 30px 60px -24px rgba(28,25,21,0.45); background: #fffdf8; }
  .device img { display: block; width: 360px; }
  .fine { position: absolute; left: 88px; bottom: 28px; font-size: 14px; color: #5c564c; }
  .browser { position: absolute; inset: 40px 56px; border-radius: 16px; overflow: hidden; border: 1px solid #e3dcd0; background: #fffdf8; box-shadow: 0 30px 60px -24px rgba(28,25,21,0.4); display: grid; grid-template-rows: 44px 1fr; }
  .chrome { display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #ece7dd; border-bottom: 1px solid #e3dcd0; }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: #d8d0c2; }
  .url { margin-left: 16px; flex: 1; max-width: 520px; height: 26px; border-radius: 13px; background: #fffdf8; font-size: 13px; color: #5c564c; display: flex; align-items: center; padding: 0 12px; }
  .split { display: grid; grid-template-columns: 1fr 420px; min-height: 0; }
  .split iframe { width: 100%; height: 100%; border: 0; }
  .split .panel { border-left: 1px solid #e3dcd0; overflow: hidden; }
  .split .panel img { width: 420px; display: block; }
  .tag { position: absolute; left: 80px; bottom: 64px; padding: 14px 20px; border-radius: 14px; background: #0c6b5e; color: #fff; font-size: 22px; font-weight: 700; box-shadow: 0 16px 30px -16px rgba(12,107,94,0.9); }
`;

const hero = (title, lede, shot, chips = []) => `
  <div class="wrap">
    <div>
      <div class="brand"><img src="${logo}" alt=""><span><b>ATLAS</b> Explain</span></div>
      <h1>${title}</h1>
      <p class="lede">${lede}</p>
      <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    </div>
    <div class="device"><img src="${img(shot)}" alt=""></div>
  </div>
  <p class="fine">Educational information, not investment advice.</p>`;

const screens = {
  "screenshot-1-explain": hero("Select any market term. <span>Get it in plain language.</span>", "Highlight jargon on any page and get a calm, two-sided explanation. Never a trade call.", "popup-answer", ["On-device first", "Two sides, every time"]),
  "screenshot-2-highlight": hero("Highlight, then Explain. <span>On your device first.</span>", "Gemini Nano answers inside Chrome when your computer has it. Otherwise Gemini answers in the cloud, and the app says which one ran.", "popup-explain", ["Gemini Nano", "Firebase AI Logic"]),
  "screenshot-3-sidepanel": `
    <div class="browser"><div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">Any page you read: news, charts, filings</span></div>
    <div class="split"><iframe src="${demoPage}"></iframe><div class="panel"><img src="${img("panel-answer")}" alt=""></div></div></div>
    <div class="tag">Keep it open beside the page in the side panel</div>`,
  "screenshot-4-learn": hero("Learn the words <span>behind the moves.</span>", "A plain-language glossary and a short learn path: how orders fill, reading a move, measuring risk.", "popup-learn", ["17 core terms", "Free during beta"]),
  "screenshot-5-privacy": hero("Private by design. <span>Reads only what you select.</span>", "Only the highlighted text, page title and site name, and only when you ask. Never balances, account numbers or form fields.", "popup-explain", ["No account data", "No made-up numbers"]),
};

const promo = (w, h, big) => `
  <div style="display:flex;align-items:center;gap:${big ? 64 : 20}px;height:100%;padding:0 ${big ? 96 : 28}px;
    background: radial-gradient(80% 90% at 85% 20%, rgba(61,190,168,0.35), transparent 60%), linear-gradient(135deg,#0c6b5e,#0a4f45); color:#fff;">
    <img src="${logo}" alt="" style="width:${big ? 180 : 76}px;height:${big ? 180 : 76}px;border-radius:${big ? 40 : 18}px;box-shadow:0 20px 40px -20px rgba(0,0,0,0.6)">
    <div style="flex:1;min-width:0;max-width:${big ? 620 : 300}px">
      <div style="font-size:${big ? 30 : 15}px;letter-spacing:0.12em;font-weight:700;opacity:0.85">ATLAS EXPLAIN</div>
      <div style="font-family:Georgia,'DejaVu Serif',serif;font-size:${big ? 64 : 27}px;line-height:1.1;font-weight:600;margin-top:${big ? 12 : 6}px">Market jargon,<br>in plain language.</div>
      ${big ? `<div style="font-size:26px;margin-top:20px;opacity:0.9">Select any term. On-device Gemini Nano first. Education only.</div>` : ""}
    </div>
    ${big ? `<div style="margin-left:auto;flex:none;width:300px;border-radius:22px;overflow:hidden;box-shadow:0 30px 60px -20px rgba(0,0,0,0.6)"><img src="${img("popup-answer")}" style="width:300px;display:block" alt=""></div>` : ""}
  </div>`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
async function render(name, body, w, h, scale = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  // The store wants 24-bit PNGs without alpha: JPEG-free, opaque white background under everything.
  await page.screenshot({ path: join(out, `${name}.png`), omitBackground: false, type: "png" });
  await page.close();
  console.log(name, `${w * scale}x${h * scale}`);
}
for (const [name, body] of Object.entries(screens)) {
  await render(`${name}-1280x800`, body, 1280, 800);
  await render(`${name}-640x400`, body, 1280, 800, 0.5);
}
await render("promo-small-440x280", promo(440, 280, false), 440, 280);
await render("promo-marquee-1400x560", promo(1400, 560, true), 1400, 560);
await browser.close();
