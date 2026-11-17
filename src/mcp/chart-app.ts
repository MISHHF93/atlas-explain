/**
 * The interactive price chart price_history draws inside the chat (an MCP App; the shared frame,
 * bridge and line chart are in ./app-shell). Its range buttons ask the host to call price_history
 * again. It shows past prices only, with their source.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export { MCP_APP_MIME } from "./app-shell";
export const CHART_APP_URI = "ui://atlas-explain/price-chart.html";

export const CHART_APP_HTML = appPage({
  name: "atlas-explain-price-chart",
  title: "ATLAS Explain price chart",
  css: `.price { font-size: 22px; font-weight: 700; margin: 6px 0 0; font-variant-numeric: tabular-nums; }`,
  body: `  <header>
    <div><h1 id="title">Price history</h1><p class="price"><span id="price">…</span> <span id="chg" class="chg"></span></p></div>
    <div class="ranges" role="group" aria-label="Time range">
      <button type="button" data-range="24h" aria-pressed="false">24H</button>
      <button type="button" data-range="7d" aria-pressed="false">7D</button>
      <button type="button" data-range="30d" aria-pressed="false">30D</button>
    </div>
    ${EXPAND_BUTTON}
  </header>
  <div class="plot" id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-block"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="facts" id="facts"></div>`,
  footer: "Past prices only, never a forecast.",
  script: `
  let coin = null;
  function onInput(args) { if (args.coin) coin = String(args.coin).toUpperCase(); }
  function onResult(d) {
    if (!d || !Array.isArray(d.points) || d.points.length < 2) { message("No chart: the price source didn't return enough prices."); return; }
    coin = d.symbol;
    $("title").textContent = d.name + " (" + d.symbol + "), " + d.rangeLabel;
    $("price").textContent = usd(d.endUsd);
    const c = $("chg"); c.textContent = pct(d.changePct); c.className = trend(d.changePct);
    for (const b of document.querySelectorAll("[data-range]")) b.setAttribute("aria-pressed", String(b.dataset.range === d.range));
    $("facts").replaceChildren();
    for (const [label, v] of [["High", d.high], ["Low", d.low]]) {
      const s = document.createElement("span"); const b = document.createElement("b");
      b.textContent = usd(v.priceUsd); s.append(label + " ", b, " \\u00b7 " + when(v.at)); $("facts").append(s);
    }
    $("source").textContent = d.source;
    lineChart($("plot"), d.points, d.name + " " + d.rangeLabel + ": from " + usd(d.startUsd) + " to " + usd(d.endUsd) + ", " + pct(d.changePct), $("readout"), usd);
  }
  async function loadRange(range) {
    if (!coin) return;
    message("Loading " + range.toUpperCase() + "…");
    const d = await callTool("price_history", { coin, range });
    if (d) { onResult(d); reportSize(); } else message("That range couldn't be loaded right now.");
  }
  for (const b of document.querySelectorAll("[data-range]")) b.addEventListener("click", () => loadRange(b.dataset.range));
`,
});
