/**
 * The crypto board crypto_prices draws inside the chat (an MCP App; frame and bridge in
 * ./app-shell): every coin with its price, today's change and a 24-hour sparkline. Choosing a
 * coin asks the host to call price_history and opens its chart below, with 24H/7D/30D.
 * Past prices only, with their source.
 */
import { appPage } from "./app-shell";

export const BOARD_APP_URI = "ui://atlas-explain/crypto-board.html";

export const BOARD_APP_HTML = appPage({
  name: "atlas-explain-crypto-board",
  title: "ATLAS Explain crypto prices",
  css: `
  .rows { display: grid; gap: 2px; margin-top: 10px; }
  .row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1.4fr) 88px minmax(0, 1fr) 64px; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
  .row:hover, .row[aria-pressed="true"] { background: var(--soft); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .row b { font-weight: 600; }
  .row .sym { color: var(--muted); font-size: 12px; margin-left: 4px; }
  .row .num { text-align: right; }
  .row .chg { text-align: right; font-size: 13px; }
  .spark { width: 88px; height: 26px; display: block; }
  /* One neutral colour: the line covers 24 hours, the change beside it counts from 00:00 UTC, so their directions can differ. */
  .spark path { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  #detail { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  @media (max-width: 420px) { .row { grid-template-columns: minmax(0, 1fr) 64px 60px; } .spark { display: none; } }`,
  body: `  <header>
    <div><h1 id="title">Crypto prices</h1><p class="sub" id="sub">Biggest moves first. Choose a coin to see its chart.</p></div>
  </header>
  <div id="plot"><p class="msg">Loading prices…</p></div>
  <section id="detail" hidden aria-live="polite">
    <header>
      <h2 id="dtitle"></h2>
      <div class="ranges" role="group" aria-label="Time range">
        <button type="button" data-range="24h" aria-pressed="false">24H</button>
        <button type="button" data-range="7d" aria-pressed="false">7D</button>
        <button type="button" data-range="30d" aria-pressed="false">30D</button>
      </div>
    </header>
    <div class="plot" id="dplot"></div>
    <div class="readout" id="readout"></div>
  </section>`,
  footer: "Past prices only, never a forecast.",
  script: `
  let chosen = null;

  function spark(values) {
    const W = 88, H = 26, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const d = values.map((v, i) => (i ? "L" : "M") + ((i / (values.length - 1)) * W).toFixed(1) + " " + (2 + (1 - (v - lo) / span) * (H - 4)).toFixed(1)).join(" ");
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true" });
    svg.append(svgEl("path", { d }));
    return svg;
  }

  function onResult(d) {
    if (!d || !Array.isArray(d.coins) || !d.coins.length) { message("No prices to show right now."); return; }
    $("source").textContent = d.source || "";
    if (d.coins.length === 1) $("sub").textContent = "Choose the coin to see its chart.";
    const rows = Object.assign(document.createElement("div"), { className: "rows" });
    for (const c of d.coins) {
      const row = document.createElement("button");
      row.type = "button"; row.className = "row"; row.dataset.symbol = c.symbol; row.setAttribute("aria-pressed", "false");
      const name = document.createElement("span");
      name.append(Object.assign(document.createElement("b"), { textContent: c.name }), Object.assign(document.createElement("span"), { className: "sym", textContent: c.symbol }));
      const line = Array.isArray(c.spark) && c.spark.length > 1 ? spark(c.spark) : document.createElement("span");
      const price = Object.assign(document.createElement("span"), { className: "num", textContent: usd(c.priceUsd) });
      const chg = Object.assign(document.createElement("span"), { className: c.changePct == null ? "chg" : trend(c.changePct), textContent: c.changePct == null ? "\\u2013" : pct(c.changePct) });
      row.setAttribute("aria-label", c.name + ", " + usd(c.priceUsd) + (c.changePct == null ? "" : ", " + pct(c.changePct) + " " + (c.changeWindow || "")) + ". Show its chart.");
      row.append(name, line, price, chg);
      row.addEventListener("click", () => choose(c.symbol, "24h"));
      rows.append(row);
    }
    $("plot").replaceChildren(rows);
    if (d.coins.length === 1) choose(d.coins[0].symbol, "7d");
  }

  async function choose(symbol, range) {
    chosen = symbol;
    for (const r of document.querySelectorAll(".row")) r.setAttribute("aria-pressed", String(r.dataset.symbol === symbol));
    for (const b of document.querySelectorAll("[data-range]")) b.setAttribute("aria-pressed", String(b.dataset.range === range));
    $("detail").hidden = false;
    $("dtitle").textContent = symbol + ": loading…";
    $("dplot").replaceChildren(); $("readout").textContent = ""; reportSize();
    const h = await callTool("price_history", { coin: symbol, range });
    if (chosen !== symbol) return;
    if (!h || !Array.isArray(h.points) || h.points.length < 2) { $("dtitle").textContent = symbol + ": this chart couldn't be loaded right now."; reportSize(); return; }
    const t = $("dtitle"); t.replaceChildren(h.name + ", " + h.rangeLabel + " ", Object.assign(document.createElement("span"), { className: trend(h.changePct), textContent: pct(h.changePct) }));
    lineChart($("dplot"), h.points, h.name + " " + h.rangeLabel + ": from " + usd(h.startUsd) + " to " + usd(h.endUsd) + ", " + pct(h.changePct), $("readout"), usd);
    reportSize();
  }
  for (const b of document.querySelectorAll("[data-range]")) b.addEventListener("click", () => chosen && choose(chosen, b.dataset.range));
`,
});
