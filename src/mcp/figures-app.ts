/**
 * The official-figures view official_figures draws inside the chat (an MCP App; frame and bridge
 * in ./app-shell). When the answer holds three or more government bond yields from one source, it
 * draws them as a yield curve, short terms to long, and says plainly whether the curve slopes up
 * or is inverted. Every figure is also listed as a card with its value, change, date and source.
 * It describes published figures only, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const FIGURES_APP_URI = "ui://atlas-explain/official-figures.html";

export const FIGURES_APP_HTML = appPage({
  name: "atlas-explain-official-figures",
  title: "ATLAS Explain official figures",
  css: `
  .curve svg { display: block; width: 100%; height: auto; }
  .curve .grid { stroke: var(--line); stroke-width: 1; }
  .curve .axis { fill: var(--muted); font-size: 11px; font-family: inherit; }
  .curve .line { fill: none; stroke: var(--accent); stroke-width: 2.5; }
  .curve .dot { fill: var(--card); stroke: var(--accent); stroke-width: 2; cursor: pointer; }
  .curve .dot.on { fill: var(--accent); }
  .note { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; margin-top: 12px; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
  .card .name { font-size: 12px; color: var(--muted); margin: 0; }
  .card .val { font-size: 17px; font-weight: 700; margin: 2px 0 0; font-variant-numeric: tabular-nums; }
  .card .meta { font-size: 11px; color: var(--muted); margin: 2px 0 0; }
  .card ul { margin: 4px 0 0; padding-left: 16px; font-size: 12px; }`,
  body: `  <header>
    <div><h1 id="title">Official figures</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot" class="plot curve"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-block"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div id="cards" class="cards"></div>
  <div class="asks" id="asks"></div>`,
  footer: "Published figures only, never a forecast.",
  script: `
  /** "1M", "6M", "2Y", "10Y" as months, so terms sort short to long. */
  const months = (tenor) => { const m = /^(\\d+)\\s*([MY])$/i.exec(String(tenor || "")); return m ? Number(m[1]) * (m[2].toUpperCase() === "Y" ? 12 : 1) : NaN; };
  const termLabel = (tenor) => { const n = months(tenor); return n < 12 ? n + "-month" : n / 12 + "-year"; };
  const value = (f) => {
    if (typeof f.value !== "number") return "\\u2013";
    if (f.currency === "%") return f.value.toFixed(2) + "%";
    if (f.currency === "USD") return usd(f.value);
    return f.value.toLocaleString("en-US", { maximumFractionDigits: 4 }) + (f.currency ? " " + f.currency : "");
  };
  /** Rates move in percentage points; everything else in percent. */
  const change = (f) => {
    if (f.currency === "%" && typeof f.change === "number") return { text: (f.change > 0 ? "+" : f.change < 0 ? "\\u2212" : "") + Math.abs(f.change).toFixed(2) + " pt", dir: f.change };
    if (typeof f.changePct === "number") return { text: pct(f.changePct), dir: f.changePct };
    return null;
  };

  function curve(rates) {
    const pts = rates.slice().sort((a, b) => months(a.tenor) - months(b.tenor));
    const W = 600, H = 190, L = 40, R = 12, T = 12, B = 26;
    const ys = pts.map((p) => p.value), lo = Math.floor((Math.min(...ys) - 0.1) * 4) / 4, hi = Math.ceil((Math.max(...ys) + 0.1) * 4) / 4, span = hi - lo || 1;
    const x = (i) => L + (i / (pts.length - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / span) * (H - T - B);
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    for (let k = 0; k <= 4; k++) {
      const v = lo + (span * k) / 4;
      svg.append(svgEl("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      const t = svgEl("text", { class: "axis", x: L - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = v.toFixed(2) + "%"; svg.append(t);
    }
    svg.append(svgEl("path", { class: "line", d: pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ") }));
    const dots = pts.map((p, i) => {
      const lab = svgEl("text", { class: "axis", x: x(i), y: H - 8, "text-anchor": "middle" }); lab.textContent = p.tenor; svg.append(lab);
      const dot = svgEl("circle", { class: "dot", cx: x(i), cy: y(p.value), r: 5, tabindex: "0" });
      const read = () => { for (const d of dots) d.classList.remove("on"); dot.classList.add("on"); $("readout").textContent = termLabel(p.tenor) + ": " + p.value.toFixed(2) + "%" + (change(p) ? ", " + change(p).text + " " + (p.changeWindow || "") : "") + " \\u00b7 " + day(p.asOf); };
      const pick = () => { read(); tellClaude("The user is reading the " + termLabel(p.tenor) + " yield on the ATLAS Explain yield curve: " + p.value.toFixed(2) + "% (" + day(p.asOf) + ", " + (p.source || "official data") + ")."); };
      dot.addEventListener("pointerenter", read); dot.addEventListener("focus", read); dot.addEventListener("pointerdown", pick);
      svg.append(dot);
      return dot;
    });
    const first = pts[0], last = pts[pts.length - 1], gap = last.value - first.value;
    const shape = gap > 0.05 ? "Slopes up: the " + termLabel(last.tenor) + " yield is " + gap.toFixed(2) + " pt above the " + termLabel(first.tenor) + "."
      : gap < -0.05 ? "Inverted: the " + termLabel(first.tenor) + " yield is " + (-gap).toFixed(2) + " pt above the " + termLabel(last.tenor) + "."
      : "Flat: short and long terms yield about the same.";
    svg.setAttribute("aria-label", "Yield curve from " + termLabel(first.tenor) + " " + first.value.toFixed(2) + "% to " + termLabel(last.tenor) + " " + last.value.toFixed(2) + "%. " + shape);
    $("plot").replaceChildren(svg, Object.assign(document.createElement("p"), { className: "note", textContent: shape + " Ask to explain \\u201cyield curve\\u201d to learn what this shape means." }));
    $("readout").textContent = "Choose a point to read its yield.";
    $("title").textContent = "Yield curve, " + (first.source || "official data");
    $("sub").textContent = "As of " + day(last.asOf);
  }

  function card(f) {
    const c = document.createElement("article"); c.className = "card";
    c.append(Object.assign(document.createElement("p"), { className: "name", textContent: f.name + " (" + f.symbol + ")" }));
    if (typeof f.value === "number") {
      const v = Object.assign(document.createElement("p"), { className: "val", textContent: value(f) + " " });
      const ch = change(f);
      // Neutral colour: for a rate or an economic figure, up isn't good and down isn't bad, so no green or red.
      if (ch) v.append(Object.assign(document.createElement("span"), { className: "chg", textContent: ch.text }));
      c.append(v);
    }
    const facts = Array.isArray(f.facts) ? f.facts.slice(0, 4) : [];
    if (facts.length) {
      const ul = document.createElement("ul");
      for (const x of facts) ul.append(Object.assign(document.createElement("li"), { textContent: x.label + ": " + x.value + (x.period ? " (" + x.period + ")" : "") }));
      c.append(ul);
    }
    if (typeof f.value !== "number" && !facts.length && f.noPriceReason) c.append(Object.assign(document.createElement("p"), { className: "meta", textContent: f.noPriceReason }));
    c.append(Object.assign(document.createElement("p"), { className: "meta", textContent: [f.asOf ? day(f.asOf) : null, f.source].filter(Boolean).join(" \\u00b7 ") }));
    return c;
  }

  function onResult(d) {
    const figs = d && Array.isArray(d.figures) ? d.figures : [];
    if (!figs.length) { message("No official figure matched."); $("cards").replaceChildren(); return; }
    const bySource = new Map();
    for (const f of figs) if (f.assetClass === "rate" && f.tenor && !isNaN(months(f.tenor)) && typeof f.value === "number") {
      const k = f.source || ""; bySource.set(k, (bySource.get(k) || []).concat([f]));
    }
    const rates = [...bySource.values()].sort((a, b) => b.length - a.length)[0] || [];
    if (rates.length >= 3) {
      curve(rates);
      askButtons($("asks"), [{ label: "Explain this curve", prompt: "Using ATLAS Explain, explain what the shape of this " + (rates[0].source || "") + " yield curve means: " + $("plot").querySelector(".note").textContent.split(" Ask to")[0] + " Also explain the terms yield curve and basis point." }]);
    } else if (figs[0]) {
      askButtons($("asks"), [{ label: "Brief on " + figs[0].symbol, prompt: "Using ATLAS Explain, give me an evidence brief on " + figs[0].symbol + " (" + figs[0].name + ")." }]);
    }
    else { $("plot").replaceChildren(); $("readout").textContent = ""; $("title").textContent = "Official figures"; $("sub").textContent = figs.length + (figs.length === 1 ? " figure" : " figures") + ", each with its source and date."; }
    $("cards").replaceChildren(...figs.slice(0, 12).map(card));
    const sources = [...new Set(figs.map((f) => f.source).filter(Boolean))];
    $("source").textContent = sources.length ? "Sources: " + sources.join(", ") + "." : "";
  }
`,
});
