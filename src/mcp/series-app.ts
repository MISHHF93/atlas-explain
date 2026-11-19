/**
 * The view data_series draws inside the chat (an MCP App; frame, bridge and line chart in ./app-shell):
 * one chart per series with its latest value, period and source line, so the numbers can be read before
 * Claude turns them into a chart, spreadsheet or report. Published values only, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const SERIES_APP_URI = "ui://atlas-explain/data-series.html";

export const SERIES_APP_HTML = appPage({
  name: "atlas-explain-data-series",
  title: "ATLAS Explain: data series",
  css: `
  .series { margin-top: 14px; }
  .series + .series { padding-top: 12px; border-top: 1px solid var(--line); }
  .series .latest { margin: 2px 0 0; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .series .src { margin: 4px 0 0; font-size: 11px; color: var(--muted); }
  .list { margin: 10px 0 0; padding-left: 18px; font-size: 13px; }
  .list li + li { margin-top: 3px; }
  .list code { font-size: 12px; }`,
  body: `  <header>
    <div><h1 id="title">Data series</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-block"></div></div></div>
  <div class="asks" id="asks"></div>`,
  footer: "Published values only, never a forecast.",
  script: `
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const big = (v) => Math.abs(v) >= 1e12 ? "$" + (v / 1e12).toFixed(2) + " trillion" : Math.abs(v) >= 1e9 ? "$" + (v / 1e9).toFixed(1) + " billion" : "$" + Math.round(v).toLocaleString("en-US");
  const fmt = (unit) => (v) => unit === "USD" ? big(v) : unit === "index" ? v.toFixed(1) : v.toFixed(2) + "%";
  const stamp = (t) => /^\\d{4}$/.test(t) ? t : period(t);
  function draw(s) {
    const box = el("section", "series");
    const f = fmt(s.unit);
    const last = s.points[s.points.length - 1];
    const plot = el("div", "plot"), readout = el("div", "readout");
    readout.setAttribute("aria-live", "polite");
    box.append(el("h2", "", s.name), el("p", "latest", f(last.value) + " "), plot, readout, el("p", "src", s.points.length + " points, " + stamp(s.points[0].date) + " to " + stamp(last.date) + ". Source: " + s.source + ". " + s.licence));
    box.querySelector(".latest").append(el("span", "sub", "for " + stamp(last.date)));
    $("plot").append(box);
    lineChart(plot, s.points.map((p) => ({ t: p.date, c: p.value })), s.name + ": from " + f(s.points[0].value) + " to " + f(last.value), readout, f, stamp);
  }
  function onResult(d) {
    if (!d || !Array.isArray(d.series)) { message("Nothing to show right now."); return; }
    $("plot").replaceChildren();
    if (!d.series.length) {
      $("title").textContent = "Data series you can ask for";
      $("sub").textContent = "Ask for one to four by id or name.";
      const ul = el("ul", "list");
      for (const a of d.available || []) { const li = el("li"); li.append(el("code", "", a.id), " " + a.name + " (" + a.points + " points, " + a.source + ")"); ul.append(li); }
      $("plot").append(ul);
      askButtons($("asks"), [{ label: "Chart US inflation", prompt: "Using ATLAS Explain's data_series, get us_cpi and make a clear chart of it with its source and period, then explain the trend in plain language without forecasting." }]);
      reportSize();
      return;
    }
    $("title").textContent = d.series.length === 1 ? d.series[0].name : d.series.length + " data series";
    $("sub").textContent = "Move over a chart to read each point.";
    d.series.forEach(draw);
    $("source").textContent = "";
    const names = d.series.map((s) => s.name).join(", ");
    askButtons($("asks"), [
      { label: "Make a chart I can keep", prompt: "Using ATLAS Explain's data_series for " + names + ", build a clean chart and a small table I can keep (as an artifact or spreadsheet). Label the units and periods, and put each source and its licence under it. No forecast." },
      { label: "Explain the trend", prompt: "Using ATLAS Explain, explain in plain language what " + names + " did over this period and what the terms mean. Name the source and period, and don't forecast anything." },
    ]);
    reportSize();
  }
`,
});
