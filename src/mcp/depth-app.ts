/**
 * The order-book view market_depth draws inside the chat (an MCP App; frame and bridge in
 * ./app-shell): the best bid and ask with the spread, then a depth chart of Kraken's order book,
 * bids stepping down to the left of the middle price and asks stepping up to the right, and what
 * filling a few order sizes against the book would cost in slippage. A snapshot, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const DEPTH_APP_URI = "ui://atlas-explain/market-depth.html";

export const DEPTH_APP_HTML = appPage({
  name: "atlas-explain-market-depth",
  title: "ATLAS Explain market depth",
  css: `
  .quote { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .quote div { min-width: 90px; }
  .quote .k { font-size: 11px; color: var(--muted); margin: 0; }
  .quote .v { font-size: 17px; font-weight: 700; margin: 0; }
  .depth svg { display: block; width: 100%; height: auto; }
  .depth .bid { fill: var(--up); opacity: .18; } .depth .bidline { fill: none; stroke: var(--up); stroke-width: 2; }
  .depth .ask { fill: var(--down); opacity: .18; } .depth .askline { fill: none; stroke: var(--down); stroke-width: 2; }
  .depth .mid { stroke: var(--muted); stroke-dasharray: 3 3; }
  .depth .axis { fill: var(--muted); font-size: 11px; font-family: inherit; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--muted); font-weight: 600; }`,
  body: `  <header>
    <div><h1 id="title">Market depth</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div class="quote" id="quote"></div>
  <div id="plot" class="plot depth"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-block"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="asks" id="asks"></div>
  <table id="impact" hidden><thead><tr><th>Order size</th><th>Side of the book</th><th>Average price</th><th>Slippage</th></tr></thead><tbody></tbody></table>`,
  footer: "A snapshot of the order book, never a forecast.",
  script: `
  function cell(k, v) {
    const d = document.createElement("div");
    d.append(Object.assign(document.createElement("p"), { className: "k", textContent: k }), Object.assign(document.createElement("p"), { className: "v", textContent: v }));
    return d;
  }
  function draw(book, mid) {
    const cum = (side) => { let s = 0; return side.map(([p, q]) => [p, (s += p * q)]); };
    const bids = cum(book.bids), asks = cum(book.asks);
    const W = 600, H = 200, L = 8, R = 8, T = 10, B = 24;
    const lo = bids[bids.length - 1][0], hi = asks[asks.length - 1][0];
    const span = Math.max(mid - lo, hi - mid) || 1, xmin = mid - span, xmax = mid + span;
    const ymax = Math.max(bids[bids.length - 1][1], asks[asks.length - 1][1]) || 1;
    const x = (p) => L + ((p - xmin) / (xmax - xmin)) * (W - L - R), y = (v) => T + (1 - v / ymax) * (H - T - B);
    const step = (pts) => { let d = "M" + x(pts[0][0]).toFixed(1) + " " + y(0).toFixed(1); for (const [p, v] of pts) d += " L" + x(p).toFixed(1) + " " + y(v).toFixed(1); return d; };
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Order book depth: " + usd(bids[bids.length - 1][1]) + " of bids and " + usd(asks[asks.length - 1][1]) + " of asks in the levels shown" });
    const bl = step(bids), al = step(asks);
    svg.append(
      svgEl("path", { class: "bid", d: bl + " L" + x(bids[bids.length - 1][0]).toFixed(1) + " " + y(0) + " Z" }), svgEl("path", { class: "bidline", d: bl }),
      svgEl("path", { class: "ask", d: al + " L" + x(asks[asks.length - 1][0]).toFixed(1) + " " + y(0) + " Z" }), svgEl("path", { class: "askline", d: al }),
      svgEl("line", { class: "mid", x1: x(mid), x2: x(mid), y1: T, y2: H - B }),
    );
    for (const [p, anchor] of [[xmin, "start"], [mid, "middle"], [xmax, "end"]]) {
      const t = svgEl("text", { class: "axis", x: x(p), y: H - 6, "text-anchor": anchor }); t.textContent = usd(p); svg.append(t);
    }
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), p = xmin + ((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (xmax - xmin);
      const side = p < mid ? bids.filter(([bp]) => bp >= p) : asks.filter(([ap]) => ap <= p);
      const total = side.length ? side[side.length - 1][1] : 0;
      $("readout").textContent = (p < mid ? "Bids from " + usd(p) + " up to the best bid: " : "Asks from the best ask up to " + usd(p) + ": ") + usd(total);
    });
    $("plot").replaceChildren(svg);
    $("readout").textContent = "Move over the chart to add up the book.";
  }
  function onResult(d) {
    if (!d || typeof d.midUsd !== "number") { message("No order book to show right now."); return; }
    $("title").textContent = d.name + " (" + d.symbol + ") order book";
    $("sub").textContent = "Best bid and ask as of " + when(d.quoteAsOf) + (d.book ? "; order book as of " + when(d.book.asOf) : "");
    $("quote").replaceChildren(cell("Best bid", usd(d.bidUsd)), cell("Best ask", usd(d.askUsd)), cell("Spread", usd(d.spreadUsd) + " (" + d.spreadBps.toFixed(2) + " bp)"), cell("Middle price", usd(d.midUsd)));
    if (d.book && d.book.bids.length && d.book.asks.length) draw(d.book, d.midUsd); else message("The order book itself isn't available right now; the spread above is current.");
    askButtons($("asks"), [
      { label: "Explain these costs", prompt: "Using ATLAS Explain, explain " + d.name + "'s bid-ask spread of " + d.spreadBps.toFixed(2) + " basis points and the slippage numbers in plain language." },
      { label: "Brief on " + d.symbol, prompt: "Using ATLAS Explain, give me an evidence brief on " + d.name + "." },
    ]);
    const rows = Array.isArray(d.impact) ? d.impact : [];
    $("impact").hidden = !rows.length;
    $("impact").tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      for (const v of [usd(r.sizeUsd), r.side === "asks" ? "Against the asks" : "Against the bids", r.filled ? usd(r.avgPriceUsd) : "Beyond the levels shown", r.filled ? (r.slippagePct === 0 ? "0%" : r.slippagePct.toFixed(4) + "%") : "\\u2013"]) tr.append(Object.assign(document.createElement("td"), { textContent: v }));
      return tr;
    }));
    $("source").textContent = d.source || "";
  }
`,
});
