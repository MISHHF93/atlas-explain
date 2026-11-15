// Images for the Claude connectors directory listing (docs/CONNECTOR_SUBMISSION.md):
//   - four carousel screenshots of the MCP App chart, 1200px wide PNG, cropped to the app response
//   - the 512×512 icon, rendered from public/app-icon.svg
// It renders the real chart page (src/mcp/chart-app.ts, read from the live server) and feeds it real
// price_history results from the live server, the way Claude does. Needs the internet; nothing is made up.
//   node store/src/capture-connector.mjs        (writes store/connector/*.png)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, sleep } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "connector");
mkdirSync(out, { recursive: true });
const MCP = process.env.MCP_URL ?? "https://atlas-explain-mcp.atlas-explain.workers.dev/mcp";

let id = 1;
async function rpc(method, params) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

// name, arguments, theme, hover position (0–1 across the chart, or null), and the prompt shown with it.
const shots = [
  ["chart-btc-7d", { coin: "BTC", range: "7d" }, "light", 0.62, "Show me Bitcoin's price over the last 7 days with ATLAS Explain."],
  ["chart-eth-30d", { coin: "ETH", range: "30d" }, "light", null, "How has Ethereum moved over the last 30 days? Use ATLAS Explain."],
  ["chart-sol-24h", { coin: "SOL", range: "24h" }, "dark", 0.35, "Using ATLAS Explain, chart Solana over the last 24 hours."],
  ["chart-xrp-7d", { coin: "XRP", range: "7d" }, "dark", null, "What did XRP do this week? Show it with ATLAS Explain."],
];

const html = (await rpc("resources/read", { uri: "ui://atlas-explain/price-chart.html" })).contents[0].text;
const chrome = await launchChrome(9334);
const prompts = [];
try {
  for (const [name, args, theme, hover, prompt] of shots) {
    const result = await rpc("tools/call", { name: "price_history", arguments: args });
    if (result.isError || !result.structuredContent) throw new Error(`${name}: ${result.content?.[0]?.text}`);
    const tab = await chrome.open(600, 340, 2);
    await tab.goto(`data:text/html;base64,${Buffer.from(html).toString("base64")}`, 800);
    // Play the host: set the theme and deliver the tool result, as Claude does after ui/initialize.
    await tab.eval(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; window.postMessage(${JSON.stringify({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result })}, "*"); true`);
    await sleep(600);
    if (hover != null) {
      await tab.eval(`(() => { const s = document.querySelector("svg"); const r = s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width * ${hover}, clientY: r.top + r.height / 2, bubbles: true })); return true; })()`);
      await sleep(200);
    }
    if (!(await tab.eval(`Boolean(document.querySelector("svg path.line"))`))) throw new Error(`${name}: the chart did not draw`);
    const height = await tab.eval(`Math.ceil(document.querySelector("main").getBoundingClientRect().height)`);
    await tab.resize(600, height);
    writeFileSync(join(out, `${name}.png`), await tab.png());
    prompts.push(`${name}.png: "${prompt}" (${result.structuredContent.source})`);
    console.log(name, `1200x${height * 2}`);
    await tab.close();
  }
  // The icon: the ATLAS Explain mark at 512×512.
  const svg = readFileSync(join(here, "..", "..", "public", "app-icon.svg"), "utf8");
  const icon = await chrome.open(512, 512, 1);
  await icon.goto(`data:text/html;base64,${Buffer.from(`<!doctype html><html><body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="512" height="512" style="display:block"></body></html>`).toString("base64")}`, 600);
  writeFileSync(join(out, "icon-512.png"), await icon.png());
  console.log("icon-512 512x512");
  await icon.close();
} finally {
  await chrome.close();
}
writeFileSync(join(out, "prompts.txt"), prompts.join("\n") + "\n");
