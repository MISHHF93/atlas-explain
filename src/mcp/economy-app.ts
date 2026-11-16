/**
 * The economy view economy_snapshot draws inside the chat (an MCP App; frame and bridge in
 * ./app-shell): a card per indicator with its latest value, change, period and source, a small
 * trend line, and a larger chart of the chosen indicator; below, the next rate decisions.
 * Published figures only, never a forecast.
 */
import { appPage } from "./app-shell";

export const ECONOMY_APP_URI = "ui://atlas-explain/economy.html";

export const ECONOMY_APP_HTML = appPage({
  name: "atlas-explain-economy",
  title: "ATLAS Explain economy",
  css: `
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; }
  .card { all: unset; box-sizing: border-box; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; cursor: pointer; display: block; }
  .card:hover, .card[aria-pressed="true"] { background: var(--soft); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .card .name { font-size: 12px; color: var(--muted); margin: 0; }
  .card .val { font-size: 18px; font-weight: 700; margin: 2px 0 0; font-variant-numeric: tabular-nums; }
  .card .meta { font-size: 11px; color: var(--muted); margin: 2px 0 0; }
  .spark { width: 100%; height: 22px; display: block; margin-top: 4px; }
  .spark path { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  #detail { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .note { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  .events { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; font-size: 13px; }
  .events b { font-variant-numeric: tabular-nums; }
  h2.events-title { margin-top: 14px; }`,
  body: `  <header>
    <div><h1 id="title">The economy</h1><p class="sub" id="sub">Choose a card to see its trend.</p></div>
  </header>
  <div id="plot"><p class="msg">Loading…</p></div>
  <section id="detail" hidden aria-live="polite">
    <h2 id="dtitle"></h2>
    <p class="note" id="dnote"></p>
    <div class="plot" id="dplot"></div>
    <div class="readout" id="readout"></div>
  </section>
  <section id="calendar" hidden>
    <h2 class="events-title">Next rate decisions</h2>
    <ul class="events" id="events"></ul>
  </section>`,
  footer: "Published figures only, never a forecast.",
  script: `
  let current = [];
  const fmt = (ind, v) => ind.unit === "USD" ? (v >= 1e12 ? "$" + (v / 1e12).toFixed(2) + " trillion" : usd(v)) : v.toFixed(2) + "%";
  const chg = (ind) => {
    if (ind.change == null) return null;
    const sign = ind.change > 0 ? "+" : ind.change < 0 ? "\\u2212" : "";
    return { text: sign + Math.abs(ind.change).toFixed(2) + (ind.unit === "%" ? " pt" : "%"), dir: ind.change };
  };
  function spark(values) {
    const W = 160, H = 22, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const d = values.map((v, i) => (i ? "L" : "M") + ((i / (values.length - 1)) * W).toFixed(1) + " " + (2 + (1 - (v - lo) / span) * (H - 4)).toFixed(1)).join(" ");
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true" });
    svg.append(svgEl("path", { d }));
    return svg;
  }
  function choose(id) {
    const ind = current.find((i) => i.id === id);
    if (!ind) return;
    for (const c of document.querySelectorAll(".card")) c.setAttribute("aria-pressed", String(c.dataset.id === id));
    $("detail").hidden = false;
    $("dtitle").textContent = ind.name + ", " + period(ind.series[0].t) + " to " + period(ind.period);
    $("dnote").textContent = [ind.note, ind.source].filter(Boolean).join(" \\u00b7 ");
    const pts = ind.series.map((p) => ({ t: p.t, c: p.v }));
    lineChart($("dplot"), pts, ind.name + ": from " + fmt(ind, pts[0].c) + " to " + fmt(ind, pts[pts.length - 1].c), $("readout"), (v) => fmt(ind, v), period);
    reportSize();
  }
  function onResult(d) {
    current = d && Array.isArray(d.indicators) ? d.indicators.filter((i) => Array.isArray(i.series) && i.series.length > 1) : [];
    if (!current.length) message("No economic figure matched.");
    else {
      const cards = Object.assign(document.createElement("div"), { className: "cards" });
      for (const ind of current) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "card"; b.dataset.id = ind.id; b.setAttribute("aria-pressed", "false");
        const v = Object.assign(document.createElement("p"), { className: "val", textContent: fmt(ind, ind.value) + " " });
        const c = chg(ind);
        if (c) v.append(Object.assign(document.createElement("span"), { className: trend(c.dir), textContent: c.text }));
        b.append(
          Object.assign(document.createElement("p"), { className: "name", textContent: ind.name }),
          v,
          Object.assign(document.createElement("p"), { className: "meta", textContent: period(ind.period) + " \\u00b7 " + ind.source }),
          spark(ind.series.map((p) => p.v)),
        );
        b.setAttribute("aria-label", ind.name + ": " + fmt(ind, ind.value) + " for " + period(ind.period) + ". Show its trend.");
        b.addEventListener("click", () => choose(ind.id));
        cards.append(b);
      }
      $("plot").replaceChildren(cards);
      choose(current[0].id);
    }
    const events = d && Array.isArray(d.nextEvents) ? d.nextEvents : [];
    $("calendar").hidden = !events.length;
    $("events").replaceChildren(...events.map((e) => {
      const li = document.createElement("li");
      li.append(Object.assign(document.createElement("b"), { textContent: day(e.date) }), " \\u00b7 " + e.institution + (e.withProjections ? " (with economic projections)" : ""));
      return li;
    }));
    const sources = [...new Set(current.map((i) => i.source))];
    $("source").textContent = sources.length ? "Sources: " + sources.join(", ") + "." : "";
  }
`,
});
