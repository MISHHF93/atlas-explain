/**
 * The view money_maths draws inside the chat (an MCP App; frame and bridge in ./app-shell): the result as a
 * chart, with the inputs as fields the person can change. Changing a field reruns the same moneyMaths
 * function the tool used (embedded below), so nothing is sent anywhere until they ask Claude about it.
 * Arithmetic on the person's own numbers; never a forecast.
 */
import { moneyMaths } from "../core/money-maths";
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const MONEY_APP_URI = "ui://atlas-explain/money-maths.html";

export const MONEY_APP_HTML = appPage({
  name: "atlas-explain-money-maths",
  title: "ATLAS Explain money maths",
  css: `
  .fields { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 10px; }
  .fields label { display: grid; gap: 3px; font-size: 11px; color: var(--muted); }
  .fields input { width: 110px; font: inherit; font-size: 13px; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px; }
  .fields input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .result { margin: 10px 0 0; padding-left: 18px; font-size: 13px; }
  .result li + li { margin-top: 4px; }
  .result li:last-child { color: var(--muted); font-size: 12px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; color: var(--muted); }
  .key { display: inline-block; width: 12px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
  .s0 { stroke: var(--accent); background: var(--accent); } .s1 { stroke: var(--muted); background: var(--muted); }
  .mline { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .mline.s1 { stroke-dasharray: 5 4; }
  .multi { display: block; width: 100%; height: 170px; }
  main[data-mode="fullscreen"] .multi { height: 300px; }`,
  body: `  <header>
    <div><h1 id="title">Money maths</h1><p class="sub" id="sub">Change any number to see the result move.</p></div>
    ${EXPAND_BUTTON}
  </header>
  <form class="fields" id="fields" onsubmit="return false"></form>
  <div id="plot" class="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-block"></div></div></div>
  <div class="legend" id="legend"></div>
  <ul class="result" id="result" aria-live="polite"></ul>
  <div class="asks" id="asks"></div>`,
  footer: "Arithmetic on the numbers you chose, never a forecast.",
  script: `
  const compute = ${moneyMaths.toString()};
  const FIELDS = {
    compound_growth: [["amount", "Starting amount"], ["monthly", "Added each month"], ["ratePct", "Yearly return %"], ["years", "Years"]],
    fees: [["amount", "Starting amount"], ["monthly", "Added each month"], ["ratePct", "Yearly return %"], ["feePct", "Yearly fee %"], ["years", "Years"]],
    inflation: [["amount", "Amount"], ["inflationPct", "Yearly inflation %"], ["years", "Years"]],
    diversification: [["volatilityPct", "Swing of one holding %"], ["correlation", "Correlation (-1 to 1)"], ["holdings", "Up to this many holdings"]],
  };
  const TITLES = { compound_growth: "Compound growth", fees: "What a fee costs over time", inflation: "What inflation does to cash", diversification: "Holding more, swinging less" };
  let current = null;
  const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100));
  function chart(r) {
    const W = 600, H = 170, pad = 6;
    const all = r.series.flatMap((s) => s.points);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(0, ...ys), hi = Math.max(...ys) || 1;
    const X = (x) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (y) => pad + (1 - (y - lo) / (hi - lo || 1)) * (H - 2 * pad);
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", class: "multi", role: "img", "aria-label": r.lines[0] });
    svg.append(svgEl("line", { class: "grid", x1: 0, x2: W, y1: Y(hi), y2: Y(hi) }), svgEl("line", { class: "grid", x1: 0, x2: W, y1: Y(lo), y2: Y(lo) }));
    r.series.forEach((s, i) => svg.append(svgEl("path", { class: "mline s" + i, d: s.points.map((p, j) => (j ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ") })));
    const frame = Object.assign(document.createElement("div"), { className: "frame" });
    const tag = (cls, t) => Object.assign(document.createElement("span"), { className: cls, textContent: t });
    frame.append(svg, tag("ylab hi", fmt(hi) + (r.calculation === "diversification" ? "%" : "")), tag("ylab lo", fmt(lo) + (r.calculation === "diversification" ? "%" : "")));
    const axis = Object.assign(document.createElement("div"), { className: "xaxis" });
    axis.append(tag("", r.xLabel + " " + x0), tag("", String(x1)));
    $("plot").replaceChildren(frame, axis);
    $("legend").replaceChildren(...r.series.map((s, i) => { const k = tag("", ""); k.append(Object.assign(document.createElement("span"), { className: "key s" + i }), s.name); return k; }));
  }
  function show(r, byUser) {
    if (!r || r.error) { message(r && r.error ? r.error : "Nothing to show."); return; }
    current = r;
    $("title").textContent = TITLES[r.calculation] || "Money maths";
    chart(r);
    $("result").replaceChildren(...r.lines.map((l) => Object.assign(document.createElement("li"), { textContent: l })));
    askButtons($("asks"), [
      { label: "Explain this result", prompt: "Using ATLAS Explain, explain this money maths result in plain language, and what it teaches: " + r.lines.slice(0, 2).join(" ") },
      { label: "Try other numbers", prompt: "Using ATLAS Explain's money_maths, show me the same " + r.calculation.replace("_", " ") + " calculation with different numbers so I can compare." },
    ]);
    if (byUser) tellClaude("The user changed the ATLAS Explain money maths view: " + r.lines[0]);
    reportSize();
  }
  function fields(r) {
    const form = $("fields");
    form.replaceChildren(...(FIELDS[r.calculation] || []).map(([key, label]) => {
      const l = document.createElement("label");
      const input = Object.assign(document.createElement("input"), { type: "number", name: key, step: "any", value: r.inputs[key] ?? "" });
      input.setAttribute("inputmode", "decimal");
      l.append(label, input);
      return l;
    }));
    let timer = 0;
    form.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = { calculation: r.calculation };
        for (const el of form.elements) if (el.name && el.value !== "") next[el.name] = Number(el.value);
        show(compute(next), true);
      }, 250);
    };
  }
  function onResult(d) {
    if (!d || !d.calculation) { message(d && d.error ? d.error : "Nothing to show."); return; }
    fields(d);
    show(d, false);
  }
`,
});
