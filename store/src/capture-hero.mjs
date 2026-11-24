// The home page's hero image: the inflation calculator's view, drawn from a live answer.
// Like capture-connector.mjs, it renders the real view page (read from the live server) and feeds it
// the real tool result, the way Claude does. Needs the internet; nothing is made up.
//   node store/src/capture-hero.mjs        (writes public/shots/connector-inflation.png)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, sleep } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "public", "shots", "connector-inflation.png");
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

const tool = (await rpc("tools/list", {})).tools.find((t) => t.name === "inflation_calculator");
if (!tool?._meta?.ui?.resourceUri) throw new Error("inflation_calculator has no view on the live server");
const html = (await rpc("resources/read", { uri: tool._meta.ui.resourceUri })).contents[0].text;
const result = await rpc("tools/call", { name: "inflation_calculator", arguments: { amount: 1000, from_year: 1990, country: "US" } });
if (result.isError || !result.structuredContent) throw new Error(result.content?.[0]?.text ?? "no answer");

const chrome = await launchChrome(9335);
try {
  const tab = await chrome.open(600, 400, 2);
  await tab.goto(`data:text/html;base64,${Buffer.from(html).toString("base64")}`, 800);
  // Light theme on white, as in a light Claude chat (the view itself is transparent).
  await tab.eval(`document.documentElement.dataset.theme = "light"; document.documentElement.style.background = "#ffffff"; window.postMessage(${JSON.stringify({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result })}, "*"); true`);
  await sleep(700);
  if (!(await tab.eval(`Boolean(document.querySelector("svg.multi path.mline"))`))) throw new Error("the view did not draw");
  const height = await tab.eval(`Math.ceil(document.querySelector("main").getBoundingClientRect().height)`);
  await tab.resize(600, height);
  writeFileSync(out, await tab.png());
  console.log(`connector-inflation.png 1200x${height * 2}: ${result.structuredContent.lines[0]} (${result.structuredContent.source.name})`);
  await tab.close();
} finally {
  await chrome.close();
}
