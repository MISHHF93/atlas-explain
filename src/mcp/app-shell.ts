/**
 * The shared frame for ATLAS Explain's MCP Apps (spec 2026-01-26): the interactive views that
 * hosts supporting MCP Apps (Claude web and desktop, ChatGPT, VS Code) draw inside the chat for
 * price_history, crypto_prices and official_figures. Hosts without it show the text answer.
 *
 * Each app is one self-contained page: no external scripts, styles, fonts or network calls, so
 * the host's default CSP (connect-src 'none') is enough. This frame supplies what every app
 * shares: the theme tokens, the formatting helpers, a line chart, and the postMessage JSON-RPC
 * bridge (ui/initialize, tool input and result notifications, tools/call back to this server).
 *
 * An app's script defines onInput(args) and onResult(structuredContent); the bridge calls them.
 */
import { EDUCATION_SHORT } from "../core/links";

export const MCP_APP_MIME = "text/html;profile=mcp-app";
export const MCP_APP_PROTOCOL = "2026-01-26";

const BASE_CSS = `
  :root { --bg: #ffffff; --fg: #1c1b19; --muted: #6b675f; --line: #e6e2da; --soft: #f4f1ec; --accent: #0c6b5e; --up: #0c7a5a; --down: #b4432f; color-scheme: light; }
  :root[data-theme="dark"] { --bg: #1c1a17; --fg: #f1ede6; --muted: #a59f94; --line: #3a3630; --soft: #26231f; --accent: #4fc1a9; --up: #4fc1a9; --down: #ef8a73; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { padding: 14px 16px 12px; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 650; }
  h2 { font-size: 14px; margin: 0; font-weight: 650; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .num { font-variant-numeric: tabular-nums; }
  .chg { font-weight: 600; font-variant-numeric: tabular-nums; }
  .chg.up { color: var(--up); } .chg.down { color: var(--down); }
  .ranges { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 2px; }
  .ranges button { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .ranges button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
  .ranges button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .plot { position: relative; margin-top: 10px; touch-action: none; }
  .plot svg.line-chart { display: block; width: 100%; height: 150px; }
  .area { fill: var(--accent); opacity: .12; } .line { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--muted); opacity: .6; pointer-events: none; display: none; }
  .readout { min-height: 20px; margin-top: 6px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--muted); }
  .facts b { color: var(--fg); font-weight: 600; }
  footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .msg { color: var(--muted); padding: 24px 0; text-align: center; }
`;

/** Formatting and drawing helpers every app can call. */
const HELPERS_JS = `
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: v >= 1 ? 2 : 4, maximumFractionDigits: v >= 1 ? 2 : 6 });
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const day = (t) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const pct = (v) => (v > 0 ? "+" : v < 0 ? "\\u2212" : "") + Math.abs(v).toFixed(2) + "%";
  const trend = (v) => (v > 0 ? "chg up" : v < 0 ? "chg down" : "chg");

  /** An area line chart of [{t, c}] in host, with a cursor that reads each point out in readout. */
  function lineChart(host, points, label, readout, format) {
    const W = 600, H = 150, pad = 4, ys = points.map((p) => p.c), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - 2 * pad), pad + (1 - (p.c - lo) / span) * (H - 2 * pad)]);
    const line = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", "aria-label": label, class: "line-chart" });
    svg.append(svgEl("path", { class: "area", d: line + " L" + (W - pad) + " " + H + " L" + pad + " " + H + " Z" }), svgEl("path", { class: "line", d: line }));
    const cursor = Object.assign(document.createElement("div"), { className: "cursor" });
    host.replaceChildren(svg, cursor);
    readout.textContent = "Move over the chart to read a price.";
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((clientX - r.left) / r.width) * (points.length - 1))));
      cursor.style.display = "block"; cursor.style.left = (xy[i][0] / W) * 100 + "%";
      readout.textContent = format(points[i].c) + " \\u00b7 " + when(points[i].t);
    };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", () => { cursor.style.display = "none"; });
  }
`;

/** The MCP Apps postMessage bridge. Declared after the app's script, so it can call onInput/onResult. */
const bridgeJs = (name: string) => `
  let nextId = 1;
  const pending = new Map();
  function send(msg) { window.parent.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*"); }
  function request(method, params) {
    return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); send({ id, method, params }); });
  }
  /** Calls one of this server's tools through the host and returns its structuredContent, or null. */
  async function callTool(name, args) {
    try { const r = await request("tools/call", { name, arguments: args }); return r && !r.isError && r.structuredContent ? r.structuredContent : null; }
    catch { return null; }
  }
  function reportSize() {
    const r = document.documentElement.getBoundingClientRect();
    send({ method: "ui/notifications/size-changed", params: { width: Math.ceil(r.width), height: Math.ceil(r.height) } });
  }
  function message(text) {
    $("plot").replaceChildren(Object.assign(document.createElement("p"), { className: "msg", textContent: text }));
    reportSize();
  }
  function applyTheme(ctx) {
    const theme = ctx && ctx.theme;
    if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
    else if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
  }
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && pending.has(m.id) && !m.method) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
      return;
    }
    switch (m.method) {
      case "ui/notifications/tool-input":
        if (typeof onInput === "function" && m.params) onInput(m.params.arguments || {});
        break;
      case "ui/notifications/tool-result":
        if (m.params && m.params.isError) message("Nothing to draw. The answer above says why.");
        else { onResult(m.params && m.params.structuredContent); reportSize(); }
        break;
      case "ui/notifications/host-context-changed":
        applyTheme(m.params);
        break;
      case "ui/resource-teardown":
        if (m.id !== undefined) send({ id: m.id, result: {} });
        break;
    }
  });
  applyTheme(null);
  request("ui/initialize", {
    protocolVersion: "${MCP_APP_PROTOCOL}",
    clientInfo: { name: "${name}", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
  }).then((res) => {
    applyTheme(res && res.hostContext);
    send({ method: "ui/notifications/initialized", params: {} });
    reportSize();
  }).catch(() => message("This assistant can't show interactive views; the answer above has the same figures."));
`;

/** One complete MCP App page. footer is the app's own line before the education notice. */
export function appPage(o: { name: string; title: string; css?: string; body: string; script: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${o.title}</title>
<style>${BASE_CSS}${o.css ?? ""}</style>
</head>
<body>
<main>
${o.body}
  <footer><span id="source"></span> ${o.footer} ${EDUCATION_SHORT}</footer>
</main>
<script>
(() => {
${HELPERS_JS}
${o.script}
${bridgeJs(o.name)}
})();
</script>
</body>
</html>`;
}
