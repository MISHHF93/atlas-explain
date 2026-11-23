/**
 * The shared frame for ATLAS Explain's MCP Apps (spec 2026-01-26): the interactive views that
 * hosts supporting MCP Apps (Claude web, desktop and mobile, ChatGPT, VS Code) draw inside the
 * chat for price_history, crypto_prices, official_figures, economy_snapshot and market_depth.
 * Hosts without it show the text answer.
 *
 * Each app is one self-contained page: no external scripts, styles, fonts or network calls, so
 * the host's default CSP (connect-src 'none') is enough. This frame supplies what every app
 * shares: Claude's style variables applied at runtime (with our own palette as the fallback
 * outside a host), a transparent background so the view blends into the conversation, skeleton
 * loading states, the inline and fullscreen display modes with an expand button, the formatting
 * helpers, a line chart, and the postMessage JSON-RPC bridge (ui/initialize, tool input and
 * result notifications, tools/call back to this server). docs/NEXT_LEVEL.md item 1.
 *
 * An app's script defines onInput(args) and onResult(structuredContent); the bridge calls them.
 */
import { EDUCATION_SHORT } from "../core/links";

export const MCP_APP_MIME = "text/html;profile=mcp-app";
export const MCP_APP_PROTOCOL = "2026-01-26";

/**
 * Our palette is only the fallback: when Claude passes its style variables (--color-*, --font-*,
 * --border-radius-*), applyHost() writes them onto :root and these aliases pick them up.
 */
const BASE_CSS = `
  :root {
    --fg: var(--color-text-primary, #1c1b19);
    --muted: var(--color-text-tertiary, #6b675f);
    --line: var(--color-border-tertiary, #e6e2da);
    --soft: var(--color-background-secondary, #f4f1ec);
    --card: var(--color-background-primary, #ffffff);
    --accent: #0c6b5e; --up: var(--color-text-success, #0c7a5a); --down: var(--color-text-danger, #b4432f);
    --radius: var(--border-radius-md, 8px); --radius-pill: var(--border-radius-full, 999px);
    --font: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
  }
  :root[data-theme="dark"] {
    --fg: var(--color-text-primary, #f1ede6); --muted: var(--color-text-tertiary, #a59f94);
    --line: var(--color-border-tertiary, #3a3630); --soft: var(--color-background-secondary, #26231f);
    --card: var(--color-background-primary, #1c1a17);
    --accent: #4fc1a9; --up: var(--color-text-success, #4fc1a9); --down: var(--color-text-danger, #ef8a73);
  }
  * { box-sizing: border-box; }
  /* Transparent, so the conversation shows through; the host sets the colour scheme. */
  html, body { margin: 0; background: transparent; color: var(--fg); font: 14px/1.4 var(--font); }
  /* Claude's safe-area insets (hostContext.safeAreaInsets, set by applyHost) keep controls clear of screen edges and overlays. */
  main { padding: calc(12px + var(--safe-top, 0px)) calc(16px + var(--safe-right, 0px)) calc(12px + var(--safe-bottom, 0px)) calc(16px + var(--safe-left, 0px)); }
  main[data-mode="fullscreen"] { max-width: 960px; margin: 0 auto; padding: calc(20px + var(--safe-top, 0px)) calc(24px + var(--safe-right, 0px)) calc(20px + var(--safe-bottom, 0px)) calc(24px + var(--safe-left, 0px)); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; }
  h2 { font-size: 14px; margin: 0; font-weight: 600; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .num { font-variant-numeric: tabular-nums; }
  .chg { font-weight: 600; font-variant-numeric: tabular-nums; }
  .chg.up { color: var(--up); } .chg.down { color: var(--down); }
  .tools { display: inline-flex; align-items: center; gap: 8px; }
  .ranges { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: 2px; }
  .ranges button { all: unset; cursor: pointer; padding: 6px 12px; min-height: 32px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; color: var(--muted); }
  .ranges button[aria-pressed="true"] { background: var(--fg); color: var(--card); }
  .ranges button:focus-visible, .expand:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .expand { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: var(--radius); color: var(--muted); }
  .expand[hidden] { display: none; }
  .expand svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  .plot { position: relative; margin-top: 10px; touch-action: none; }
  .plot svg.line-chart { display: block; width: 100%; height: 150px; }
  main[data-mode="fullscreen"] .plot svg.line-chart { height: 280px; }
  .area { fill: var(--accent); opacity: .12; } .line { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .frame { position: relative; }
  .grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
  .ylab { position: absolute; right: 0; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; line-height: 1; padding: 1px 0 1px 4px; background: color-mix(in srgb, var(--card) 88%, transparent); border-radius: 3px; pointer-events: none; }
  .ylab.hi { top: 0; } .ylab.lo { bottom: 2px; }
  .xaxis { display: flex; justify-content: space-between; margin-top: 3px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--muted); opacity: .6; pointer-events: none; display: none; }
  .readout { min-height: 20px; margin-top: 6px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--muted); }
  .facts b { color: var(--fg); font-weight: 600; }
  footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .msg { color: var(--muted); padding: 24px 0; text-align: center; }
  /* "Ask Claude" actions: at most two per view, worded as questions (Claude's inline-card rule). */
  .asks { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
  .asks:empty { display: none; }
  .ask { all: unset; cursor: pointer; display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill); font-size: 13px; font-weight: 600; color: var(--fg); }
  .ask:hover { background: var(--soft); }
  .ask:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ask-status { font-size: 12px; color: var(--muted); }
  .show-all { margin-top: 10px; grid-column: 1 / -1; justify-self: start; }
  /* Skeletons while a result is on its way: the shape of the content, not a spinner. */
  .sk { display: grid; gap: 10px; margin-top: 10px; }
  .sk-line, .sk-block { background: var(--soft); border-radius: var(--radius); animation: sk 1.2s ease-in-out infinite; }
  .sk-line { height: 12px; } .sk-line.short { width: 40%; } .sk-block { height: 150px; }
  @keyframes sk { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .sk-line, .sk-block { animation: none; } }
  /* Touch screens: every control at least 44 px tall (Claude's MCP Apps guidelines ask for 44 pt tap targets). */
  @media (pointer: coarse) {
    main button, main input, main select { min-height: 44px !important; }
    .ranges button { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; }
    .expand { width: 44px; height: 44px; }
  }
`;

/** Formatting and drawing helpers every app can call. */
const HELPERS_JS = `
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  /** Dollars: cents from $1 up; below $1, four significant digits ($0.1533, $0.05934, $0.01). */
  const usd = (v) => "$" + (Math.abs(v) >= 1 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 }));
  const when = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  /** "2026-09" as "Sep 2026"; a full date as a day. */
  const period = (t) => (/^\\d{4}-\\d{2}$/.test(t) ? new Date(t + "-15T12:00:00Z").toLocaleDateString(undefined, { year: "numeric", month: "short", timeZone: "UTC" }) : day(t));
  const day = (t) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const pct = (v) => (v > 0 ? "+" : v < 0 ? "\\u2212" : "") + Math.abs(v).toFixed(2) + "%";
  const trend = (v) => (v > 0 ? "chg up" : v < 0 ? "chg down" : "chg");
  /** The loading shape: a few lines and a chart-sized block. */
  function skeleton(lines, block) {
    const box = Object.assign(document.createElement("div"), { className: "sk" });
    box.setAttribute("aria-busy", "true"); box.setAttribute("aria-label", "Loading");
    for (let i = 0; i < lines; i++) box.append(Object.assign(document.createElement("div"), { className: "sk-line" + (i % 2 ? " short" : "") }));
    if (block) box.append(Object.assign(document.createElement("div"), { className: "sk-block" }));
    return box;
  }

  /** An area line chart of [{t, c}] in host, with a cursor that reads each point out in readout. */
  function lineChart(host, points, label, readout, format, timeFormat) {
    const stamp = timeFormat || when;
    const W = 600, H = 150, pad = 4, ys = points.map((p) => p.c), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - 2 * pad), pad + (1 - (p.c - lo) / span) * (H - 2 * pad)]);
    const line = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img", "aria-label": label, class: "line-chart" });
    svg.append(
      svgEl("line", { class: "grid", x1: 0, x2: W, y1: pad, y2: pad }), svgEl("line", { class: "grid", x1: 0, x2: W, y1: H - pad, y2: H - pad }),
      svgEl("path", { class: "area", d: line + " L" + (W - pad) + " " + H + " L" + pad + " " + H + " Z" }), svgEl("path", { class: "line", d: line }),
    );
    // The scale (highest and lowest value) and the dates at each end, as text so it never stretches with the chart.
    const tag = (cls, text) => Object.assign(document.createElement("span"), { className: cls, textContent: text });
    const cursor = Object.assign(document.createElement("div"), { className: "cursor" });
    const frame = Object.assign(document.createElement("div"), { className: "frame" });
    frame.append(svg, cursor, tag("ylab hi", format(hi)), tag("ylab lo", format(lo)));
    const axis = Object.assign(document.createElement("div"), { className: "xaxis" });
    axis.setAttribute("aria-hidden", "true");
    axis.append(tag("", stamp(points[0].t)), tag("", stamp(points[points.length - 1].t)));
    host.replaceChildren(frame, axis);
    readout.textContent = "Move over the chart to read each point.";
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((clientX - r.left) / r.width) * (points.length - 1))));
      cursor.style.display = "block"; cursor.style.left = (xy[i][0] / W) * 100 + "%";
      readout.textContent = format(points[i].c) + " \\u00b7 " + stamp(points[i].t);
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
  let hostModes = ["inline"];
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
  /**
   * Sends Claude a question when the user clicks (ui/message). Claude asks the user to allow it, or puts
   * it in the message box, so the user stays in control. Text only, well under Claude's 8,000 characters.
   */
  function askClaude(text, status) {
    status.textContent = "";
    request("ui/message", { role: "user", content: [{ type: "text", text: String(text).slice(0, 2000) }] })
      .then((r) => { status.textContent = r && r.isError ? "Claude didn't take the request. Ask in the chat instead." : "Check the conversation to send it."; reportSize(); })
      .catch(() => { status.textContent = "Ask in the chat instead."; reportSize(); });
  }
  /** Up to two "Ask Claude" buttons in host, each {label, prompt}. */
  function askButtons(host, items) {
    if (!host) return;
    const status = Object.assign(document.createElement("span"), { className: "ask-status" });
    status.setAttribute("role", "status");
    // At most two actions in an inline card: with "Show all" on screen, one question for Claude.
    const buttons = items.slice(0, document.querySelector(".show-all") ? 1 : 2).map((it) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "ask", textContent: it.label });
      b.addEventListener("click", () => askClaude(it.prompt, status));
      return b;
    });
    host.replaceChildren(...buttons, status);
    reportSize();
  }
  /**
   * Tells Claude what the user is now looking at (ui/update-model-context), for the next turn, so a
   * follow-up like "what about Ethereum?" is grounded. Only on the user's own changes; never repeated.
   */
  let lastContext = "";
  function tellClaude(text) {
    if (!text || text === lastContext) return;
    lastContext = text;
    request("ui/update-model-context", { content: [{ type: "text", text: String(text).slice(0, 1000) }] }).catch(() => {});
  }
  /** Claude's theme and style variables, applied at runtime; our palette stays as the fallback. */
  function applyHost(ctx) {
    if (!ctx) return;
    const theme = ctx.theme;
    if (theme === "dark" || theme === "light") { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }
    const vars = ctx.styles && ctx.styles.variables;
    if (vars && typeof vars === "object") for (const k in vars) if (k.startsWith("--")) document.documentElement.style.setProperty(k, String(vars[k]));
    const inset = ctx.safeAreaInsets;
    if (inset && typeof inset === "object") for (const side of ["top", "right", "bottom", "left"]) { const v = Number(inset[side]); if (Number.isFinite(v) && v >= 0) document.documentElement.style.setProperty("--safe-" + side, v + "px"); }
    if (ctx.displayMode) document.querySelector("main").dataset.mode = ctx.displayMode;
    if (Array.isArray(ctx.availableDisplayModes)) {
      const before = hostModes.join();
      hostModes = ctx.availableDisplayModes;
      // A side panel offered after the view drew: shorten its long lists now.
      if (hostModes.join() !== before && typeof redrawForMode === "function") redrawForMode();
    }
    const expand = $("expand");
    if (expand) expand.hidden = !hostModes.includes("fullscreen") || ctx.displayMode === "fullscreen" || document.querySelector("main").dataset.mode === "fullscreen";
  }
  /** Asks Claude for the side panel (fullscreen); the host decides. */
  function openSidePanel() {
    request("ui/request-display-mode", { mode: "fullscreen" }).then((r) => {
      if (!r || !r.mode) return;
      document.querySelector("main").dataset.mode = r.mode;
      const ex = $("expand"); if (ex) ex.hidden = r.mode === "fullscreen";
      reportSize();
    }).catch(() => {});
  }
  const expandButton = $("expand");
  if (expandButton) expandButton.addEventListener("click", openSidePanel);
  /**
   * Long lists (Claude's MCP Apps guidelines: about 4-5 items in an inline card). Inside the conversation a
   * view shows the first few items and "Show all", which opens the side panel; there, or where the host has
   * no side panel, everything shows. inlineCap(n) is how many to show now; whenModeChanges(fn) redraws on a switch.
   */
  let redrawForMode = null;
  function inlineCap(n) { return document.querySelector("main").dataset.mode !== "fullscreen" && hostModes.includes("fullscreen") ? n : Infinity; }
  function whenModeChanges(fn) { redrawForMode = fn; }
  function showAllButton(label) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "ask show-all", textContent: label });
    b.addEventListener("click", openSidePanel);
    return b;
  }
  new MutationObserver(() => { if (redrawForMode) { redrawForMode(); reportSize(); } }).observe(document.querySelector("main"), { attributes: true, attributeFilter: ["data-mode"] });
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
        applyHost(m.params); reportSize();
        break;
      case "ui/resource-teardown":
        if (m.id !== undefined) send({ id: m.id, result: {} });
        break;
    }
  });
  if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
  request("ui/initialize", {
    protocolVersion: "${MCP_APP_PROTOCOL}",
    clientInfo: { name: "${name}", version: "1.1.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
  }).then((res) => {
    applyHost(res && res.hostContext);
    send({ method: "ui/notifications/initialized", params: {} });
    reportSize();
  }).catch(() => message("This assistant can't show interactive views; the answer above has the same figures."));
`;

/** The expand-to-side-panel button, shown only where the host offers fullscreen. */
export const EXPAND_BUTTON = `<button type="button" class="expand" id="expand" hidden aria-label="Open in the side panel" title="Open in the side panel"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h5v5M14 2 9 7M7 14H2V9m0 5 5-5"/></svg></button>`;

/** One complete MCP App page. footer is the app's own line before the education notice. */
export function appPage(o: { name: string; title: string; css?: string; body: string; script: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${o.title}</title>
<style>${BASE_CSS}${o.css ?? ""}</style>
</head>
<body>
<main data-mode="inline">
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
