/**
 * The interactive price chart shown inside the chat (MCP Apps extension, spec 2026-01-26).
 * price_history points at it with _meta.ui.resourceUri; hosts that support MCP Apps (Claude web
 * and desktop, ChatGPT, VS Code) render it in a sandboxed iframe, others show the text answer.
 *
 * One self-contained page: no external scripts, styles, fonts or network calls, so the host's
 * default CSP (connect-src 'none') is enough. It speaks the MCP Apps postMessage JSON-RPC by hand:
 * ui/initialize, then it draws each ui/notifications/tool-result, and its range buttons ask the
 * host to call price_history again (tools/call). It shows past prices only, with their source.
 */
import { EDUCATION_SHORT } from "../core/links";

export const CHART_APP_URI = "ui://atlas-explain/price-chart.html";
export const MCP_APP_MIME = "text/html;profile=mcp-app";

export const CHART_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ATLAS Explain price chart</title>
<style>
  :root { --bg: #ffffff; --fg: #1c1b19; --muted: #6b675f; --line: #e6e2da; --accent: #0c6b5e; --up: #0c7a5a; --down: #b4432f; color-scheme: light; }
  :root[data-theme="dark"] { --bg: #1c1a17; --fg: #f1ede6; --muted: #a59f94; --line: #3a3630; --accent: #4fc1a9; --up: #4fc1a9; --down: #ef8a73; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { padding: 14px 16px 12px; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 650; }
  .price { font-size: 22px; font-weight: 700; margin: 6px 0 0; font-variant-numeric: tabular-nums; }
  .chg { font-weight: 600; font-variant-numeric: tabular-nums; }
  .chg.up { color: var(--up); } .chg.down { color: var(--down); }
  .ranges { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 2px; }
  .ranges button { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .ranges button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
  .ranges button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .plot { position: relative; margin-top: 10px; touch-action: none; }
  svg { display: block; width: 100%; height: 150px; }
  .area { fill: var(--accent); opacity: .12; } .line { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--muted); opacity: .6; pointer-events: none; display: none; }
  .readout { min-height: 20px; margin-top: 6px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--muted); }
  .facts b { color: var(--fg); font-weight: 600; }
  footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .msg { color: var(--muted); padding: 24px 0; text-align: center; }
</style>
</head>
<body>
<main>
  <header>
    <div><h1 id="title">Price history</h1><p class="price"><span id="price">…</span> <span id="chg" class="chg"></span></p></div>
    <div class="ranges" role="group" aria-label="Time range">
      <button type="button" data-range="24h" aria-pressed="false">24H</button>
      <button type="button" data-range="7d" aria-pressed="false">7D</button>
      <button type="button" data-range="30d" aria-pressed="false">30D</button>
    </div>
  </header>
  <div class="plot" id="plot"><p class="msg" id="msg">Loading the chart…</p></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="facts" id="facts"></div>
  <footer><span id="source"></span> Past prices only, never a forecast. ${EDUCATION_SHORT}</footer>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  let nextId = 1, current = null, coin = null;
  const pending = new Map();
  const send = (msg) => window.parent.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*");
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });
  const usd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: v >= 1 ? 2 : 4, maximumFractionDigits: v >= 1 ? 2 : 6 });
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const pct = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%";

  function reportSize() {
    const r = document.documentElement.getBoundingClientRect();
    send({ method: "ui/notifications/size-changed", params: { width: Math.ceil(r.width), height: Math.ceil(r.height) } });
  }

  function message(text) {
    $("plot").replaceChildren(Object.assign(document.createElement("p"), { className: "msg", textContent: text }));
    reportSize();
  }

  function draw(d) {
    if (!d || !Array.isArray(d.points) || d.points.length < 2) { message("No chart: the price source didn't return enough prices."); return; }
    current = d; coin = d.symbol;
    $("title").textContent = d.name + " (" + d.symbol + "), " + d.rangeLabel;
    $("price").textContent = usd(d.endUsd);
    const c = $("chg"); c.textContent = pct(d.changePct); c.className = "chg " + (d.changePct > 0 ? "up" : d.changePct < 0 ? "down" : "");
    for (const b of document.querySelectorAll("[data-range]")) b.setAttribute("aria-pressed", String(b.dataset.range === d.range));
    $("facts").innerHTML = "";
    for (const [label, v] of [["High", d.high], ["Low", d.low]]) {
      const s = document.createElement("span"); const b = document.createElement("b");
      b.textContent = usd(v.priceUsd); s.append(label + " ", b, " · " + when(v.at)); $("facts").append(s);
    }
    $("source").textContent = d.source;
    const W = 600, H = 150, pad = 4, ys = d.points.map((p) => p.c), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const xy = d.points.map((p, i) => [pad + (i / (d.points.length - 1)) * (W - 2 * pad), pad + (1 - (p.c - lo) / span) * (H - 2 * pad)]);
    const line = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", d.name + " " + d.rangeLabel + ": from " + usd(d.startUsd) + " to " + usd(d.endUsd) + ", " + pct(d.changePct));
    const area = document.createElementNS(ns, "path"); area.setAttribute("class", "area"); area.setAttribute("d", line + " L" + (W - pad) + " " + H + " L" + pad + " " + H + " Z");
    const path = document.createElementNS(ns, "path"); path.setAttribute("class", "line"); path.setAttribute("d", line);
    svg.append(area, path);
    const cursor = Object.assign(document.createElement("div"), { className: "cursor" });
    $("plot").replaceChildren(svg, cursor);
    $("readout").textContent = "Move over the chart to read a price.";
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(d.points.length - 1, Math.round(((clientX - r.left) / r.width) * (d.points.length - 1))));
      cursor.style.display = "block"; cursor.style.left = (xy[i][0] / W) * 100 + "%";
      $("readout").textContent = usd(d.points[i].c) + " · " + when(d.points[i].t);
    };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", () => { cursor.style.display = "none"; });
    reportSize();
  }

  async function loadRange(range) {
    if (!coin) return;
    message("Loading " + range.toUpperCase() + "…");
    try {
      const result = await request("tools/call", { name: "price_history", arguments: { coin, range } });
      if (result && result.structuredContent) draw(result.structuredContent);
      else message("That range couldn't be loaded right now.");
    } catch { message("That range couldn't be loaded right now."); }
  }
  for (const b of document.querySelectorAll("[data-range]")) b.addEventListener("click", () => loadRange(b.dataset.range));

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
        if (m.params && m.params.arguments && m.params.arguments.coin) coin = String(m.params.arguments.coin).toUpperCase();
        break;
      case "ui/notifications/tool-result":
        if (m.params && m.params.isError) message("The chart couldn't be loaded. The answer above says why.");
        else draw(m.params && m.params.structuredContent);
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
    protocolVersion: "2026-01-26",
    clientInfo: { name: "atlas-explain-price-chart", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
  }).then((res) => {
    applyTheme(res && res.hostContext);
    send({ method: "ui/notifications/initialized", params: {} });
    reportSize();
  }).catch(() => message("This assistant can't show interactive charts; the answer above has the same figures."));
})();
</script>
</body>
</html>`;
