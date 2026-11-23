/**
 * The views inflation_calculator and debt_payoff draw inside the chat (MCP Apps; frame and bridge in ./app-shell):
 * the answer as a line chart with its numbers, and buttons that ask Claude for a variation. The inflation view also
 * rescales for a different amount (the ratio between years doesn't change). Past prices and arithmetic only.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const INFLATION_APP_URI = "ui://atlas-explain/inflation.html";
export const DEBT_APP_URI = "ui://atlas-explain/debt-payoff.html";

const CHART_CSS = `
  .fields { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 10px; }
  .fields label { display: grid; gap: 3px; font-size: 11px; color: var(--muted); }
  .fields input { width: 120px; font: inherit; font-size: 13px; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px; }
  .fields input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .result { margin: 10px 0 0; padding-left: 18px; font-size: 13px; }
  .result li + li { margin-top: 4px; }
  .result li.fine { color: var(--muted); font-size: 12px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; color: var(--muted); }
  .key { display: inline-block; width: 12px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
  .s0 { stroke: var(--accent); background: var(--accent); } .s1 { stroke: var(--muted); background: var(--muted); }
  .mline { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .mline.s1 { stroke-dasharray: 5 4; }
  .multi { display: block; width: 100%; height: 170px; }
  main[data-mode="fullscreen"] .multi { height: 300px; }`;

/** A line chart of one or more series ({ name, points: [{x, y}] }) with its high and low marked. Shared by both views. */
const CHART_JS = `
  const fmtN = (v, unit) => unit + (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2));
  function lineChart(series, unit, xLabel, label) {
    const W = 600, H = 170, pad = 6;
    const all = series.flatMap((s) => s.points);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(0, ...ys), hi = Math.max(...ys) || 1;
    const X = (x) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (y) => pad + (1 - (y - lo) / (hi - lo || 1)) * (H - 2 * pad);
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", class: "multi", role: "img", "aria-label": label });
    svg.append(svgEl("line", { class: "grid", x1: 0, x2: W, y1: Y(hi), y2: Y(hi) }), svgEl("line", { class: "grid", x1: 0, x2: W, y1: Y(lo), y2: Y(lo) }));
    series.forEach((s, i) => svg.append(svgEl("path", { class: "mline s" + i, d: s.points.map((p, j) => (j ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ") })));
    const frame = Object.assign(document.createElement("div"), { className: "frame" });
    const tag = (cls, t) => Object.assign(document.createElement("span"), { className: cls, textContent: t });
    frame.append(svg, tag("ylab hi", fmtN(hi, unit)), tag("ylab lo", fmtN(lo, unit)));
    const axis = Object.assign(document.createElement("div"), { className: "xaxis" });
    axis.append(tag("", xLabel + " " + x0), tag("", String(x1)));
    $("plot").replaceChildren(frame, axis);
    $("legend").replaceChildren(...(series.length > 1 ? series.map((s, i) => { const k = tag("", ""); k.append(Object.assign(document.createElement("span"), { className: "key s" + i }), s.name); return k; }) : []));
  }
  function resultLines(lines, fineFrom) {
    $("result").replaceChildren(...lines.map((l, i) => Object.assign(document.createElement("li"), { textContent: l, className: i >= fineFrom ? "fine" : "" })));
  }`;

const SKELETON = `<div id="plot" class="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-block"></div></div></div>`;

export const INFLATION_APP_HTML = appPage({
  name: "atlas-explain-inflation",
  title: "ATLAS Explain inflation calculator",
  css: CHART_CSS,
  body: `  <header>
    <div><h1 id="title">What money from one year buys in another</h1><p class="sub" id="sub">From the official consumer price index.</p></div>
    ${EXPAND_BUTTON}
  </header>
  <form class="fields" id="fields" onsubmit="return false"><label>Amount<input type="number" id="amount" step="any" inputmode="decimal" /></label></form>
  ${SKELETON}
  <div class="legend" id="legend"></div>
  <ul class="result" id="result" aria-live="polite"></ul>
  <div class="asks" id="asks"></div>`,
  footer: "Past prices, as yearly averages; never a forecast.",
  script: `${CHART_JS}
  const SYMBOL = { US: "$", CA: "C$", UK: "£", EA: "€" };
  let base = null;
  function draw(amount, byUser) {
    const scale = amount / base.amount;
    const unit = SYMBOL[base.country] || "";
    const pts = base.points.map((p) => ({ x: p.year, y: p.value * scale }));
    lineChart([{ name: "Value", points: pts }], unit, "", (byUser ? "" : base.lines[0]) || "Value over the years");
    const value = base.value * scale;
    const first = unit + fmtN(amount, "") + " in " + base.fromYear + " buys about what " + unit + fmtN(value, "") + (base.fromYear < base.toYear ? " buys in " : " bought in ") + base.toYear + ".";
    resultLines([first, ...base.lines.slice(1)], 3);
    if (byUser) tellClaude("The user changed the amount in the ATLAS Explain inflation view: " + first);
    reportSize();
  }
  function onResult(d) {
    if (!d || !d.points) { message(d && d.error ? d.error : "Nothing to show."); return; }
    base = d;
    $("sub").textContent = d.source.series + " (" + d.source.name + ").";
    const input = $("amount");
    input.value = d.amount;
    let timer = 0;
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { const v = Number(input.value); if (v > 0) draw(v, true); }, 250); };
    draw(d.amount, false);
    askButtons($("asks"), [
      { label: "Explain what this means", prompt: "Using ATLAS Explain, explain in plain language what this tells me about inflation and cash: " + d.lines.slice(0, 2).join(" ") },
      { label: "Compare another country", prompt: "Using ATLAS Explain's inflation_calculator, work out the same amount from " + d.fromYear + " for another country so I can compare." },
    ]);
  }
`,
});

export const DEBT_APP_HTML = appPage({
  name: "atlas-explain-debt-payoff",
  title: "ATLAS Explain debt payoff",
  css: CHART_CSS,
  body: `  <header>
    <div><h1 id="title">Paying off several debts</h1><p class="sub" id="sub">Interest paid so far, month by month, by method.</p></div>
    ${EXPAND_BUTTON}
  </header>
  ${SKELETON}
  <div class="legend" id="legend"></div>
  <ul class="result" id="result" aria-live="polite"></ul>
  <div class="asks" id="asks"></div>`,
  footer: "Arithmetic on the numbers given, never a forecast; it compares and never says which to choose.",
  script: `${CHART_JS}
  const NAME = { avalanche: "Avalanche (highest rate first)", snowball: "Snowball (smallest balance first)" };
  function onResult(d) {
    if (!d || !d.plans || !d.plans.length) { message(d && d.error ? d.error : "Nothing to show."); return; }
    // Both methods pay the same each month, so what's owed falls almost alike; the interest is where they differ.
    // Interest so far = paid so far − debt cleared so far; the last month uses the plan's exact total.
    const series = d.plans.map((p) => {
      const start = p.points[0].balance;
      const last = p.points.length - 1;
      return { name: NAME[p.method] || p.method, points: p.points.map((q, i) => ({ x: q.month, y: i === last ? p.totalInterest : Math.max(0, d.budget * q.month - (start - q.balance)) })) };
    });
    lineChart(series, "$", "Month", "Interest paid so far: " + d.lines.slice(0, 2).join(" "));
    resultLines(d.lines, d.lines.length - 1);
    const more = Math.round(d.budget * 1.25);
    askButtons($("asks"), [
      { label: "Explain the two methods", prompt: "Using ATLAS Explain, explain the avalanche and snowball methods in plain language, using these results: " + d.lines.slice(0, 2).join(" ") },
      { label: "Try paying more each month", prompt: "Using ATLAS Explain's debt_payoff, work out the same debts with $" + more.toLocaleString("en-US") + " a month instead of $" + Math.round(d.budget).toLocaleString("en-US") + ", so I can compare." },
    ]);
    reportSize();
  }
`,
});
