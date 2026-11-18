/**
 * The view compare_countries draws inside the chat (an MCP App; frame and bridge in ./app-shell): a bar per
 * country for one indicator, highest first, each with the year of its figure; buttons switch the indicator.
 * Colours stay neutral (a higher figure isn't better or worse in itself). Published values only, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const COUNTRIES_APP_URI = "ui://atlas-explain/countries.html";

export const COUNTRIES_APP_HTML = appPage({
  name: "atlas-explain-countries",
  title: "ATLAS Explain: countries compared",
  css: `
  .bars { display: grid; gap: 4px; margin: 12px 0 0; padding: 0; list-style: none; }
  .bar { display: grid; grid-template-columns: minmax(90px, 30%) 1fr auto; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; border-radius: 4px; padding: 2px 4px; }
  .bar:hover, .bar:focus-visible { background: var(--soft); outline: none; }
  .bar .track { position: relative; height: 12px; }
  .bar .fill { position: absolute; top: 0; bottom: 0; background: var(--accent); opacity: .75; border-radius: 3px; }
  .bar .fill.neg { opacity: .35; }
  .bar .zero { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--muted); }
  .bar .val { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar .yr { color: var(--muted); }
  .bar.none .val { color: var(--muted); }`,
  body: `  <header>
    <div><h1 id="title">Countries compared</h1><p class="sub" id="sub"></p></div>
    <span class="tools"><span class="ranges" role="group" aria-label="Indicator" id="pick"></span>${EXPAND_BUTTON}</span>
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line short"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="asks" id="asks"></div>`,
  footer: "Each bar is the latest year the World Bank has published for that country; actual values only, never a forecast.",
  script: `
  let data = null;
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const val = (unit, v) => unit === "USD" ? "$" + Math.round(v).toLocaleString("en-US") : v.toFixed(1) + "%";
  function show(id, report) {
    const ind = data.indicators.find((i) => i.id === id);
    for (const b of document.querySelectorAll("#pick button")) b.setAttribute("aria-pressed", String(b.dataset.id === id));
    $("title").textContent = ind.name + ", countries compared";
    $("sub").textContent = ind.about + " Highest first.";
    const rows = data.countries.map((c) => ({ name: c.name, v: c.values[id] })).sort((a, b) => (b.v ? b.v.value : -Infinity) - (a.v ? a.v.value : -Infinity));
    const vals = rows.filter((r) => r.v).map((r) => r.v.value);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
    const zero = ((0 - lo) / span) * 100;
    const ul = el("ul", "bars");
    ul.setAttribute("aria-label", ind.name + " by country");
    for (const r of rows) {
      const li = el("li", "bar" + (r.v ? "" : " none"));
      li.tabIndex = 0;
      const track = el("span", "track");
      if (r.v) {
        const x = ((r.v.value - lo) / span) * 100;
        const fill = el("span", "fill" + (r.v.value < 0 ? " neg" : ""));
        fill.style.left = Math.min(zero, x) + "%"; fill.style.width = Math.max(0.5, Math.abs(x - zero)) + "%";
        track.append(fill);
      }
      if (lo < 0) { const z = el("span", "zero"); z.style.left = zero + "%"; track.append(z); }
      const v = el("span", "val", r.v ? val(ind.unit, r.v.value) + " " : "not published");
      if (r.v) v.append(el("span", "yr", r.v.year));
      li.append(el("span", "", r.name), track, v);
      const read = () => { $("readout").textContent = r.name + ": " + (r.v ? val(ind.unit, r.v.value) + " in " + r.v.year : "no figure published"); };
      li.addEventListener("mouseenter", read); li.addEventListener("focus", read);
      li.addEventListener("click", () => { read(); if (r.v) tellClaude("The user picked " + r.name + " in the ATLAS Explain countries view: " + ind.name.toLowerCase() + " " + val(ind.unit, r.v.value) + " in " + r.v.year + " (World Bank)."); });
      ul.append(li);
    }
    $("plot").replaceChildren(ul);
    const top = rows[0], last = rows.filter((r) => r.v).pop();
    askButtons($("asks"), [
      { label: "Why do they differ?", prompt: "Using ATLAS Explain's compare_countries, explain in plain language why " + ind.name.toLowerCase() + " differs so much between countries, using " + (top ? top.name : "the highest") + " and " + (last ? last.name : "the lowest") + " as examples. Name the source and years; no forecast." },
      { label: "Show the history", prompt: "Using ATLAS Explain's data_series, show world_" + id + " over the years for " + rows.filter((r) => r.v).slice(0, 3).map((r) => r.name).join(", ") + ", then describe what changed. No forecast." },
    ]);
    if (report) tellClaude("The user switched the ATLAS Explain countries view to " + ind.name + ".");
    reportSize();
  }
  function onResult(d) {
    if (!d || !Array.isArray(d.indicators) || !d.indicators.length || !Array.isArray(d.countries)) { message("Nothing to show right now."); return; }
    data = d;
    $("pick").replaceChildren(...d.indicators.map((i) => { const b = el("button", "", i.name); b.type = "button"; b.dataset.id = i.id; b.addEventListener("click", () => show(i.id, true)); return b; }));
    $("pick").hidden = d.indicators.length < 2;
    $("source").textContent = d.source || "";
    show(d.indicators[0].id, false);
  }
`,
});
