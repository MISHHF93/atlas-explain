/**
 * The view evidence_brief draws inside the chat (an MCP App; frame and bridge in ./app-shell): a one-page fact
 * sheet on an asset (figures with dates, the recent move, how easily it trades, the economic backdrop, the
 * next rate decision, terms to know) and what the brief doesn't tell you. Facts with sources, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const BRIEF_APP_URI = "ui://atlas-explain/evidence-brief.html";

export const BRIEF_APP_HTML = appPage({
  name: "atlas-explain-evidence-brief",
  title: "ATLAS Explain: evidence brief",
  css: `
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 10px; }
  .fact { border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 10px; }
  .fact .k { font-size: 11px; color: var(--muted); }
  .fact .v { margin-top: 2px; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .fact .d { margin-top: 2px; font-size: 11px; color: var(--muted); }
  .label { margin: 14px 0 0; font-size: 12px; font-weight: 600; }
  .lines { margin: 4px 0 0; padding-left: 18px; font-size: 13px; }
  .lines li + li { margin-top: 3px; }
  .terms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .term { all: unset; cursor: pointer; font-size: 12px; padding: 3px 10px; border: 1px solid var(--line); border-radius: var(--radius-pill); }
  .term:hover, .term:focus-visible { background: var(--soft); }
  .limits { margin: 4px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }`,
  body: `  <header>
    <div><h1 id="title">Evidence brief</h1><p class="sub" id="sub">Facts with their sources; never a recommendation.</p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-block"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="asks" id="asks"></div>`,
  footer: "A fact sheet, never a forecast or a recommendation.",
  script: `
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const asOf = (t) => !t ? "" : /^\\d{4}-\\d{2}-\\d{2}T/.test(t) ? when(t) : /^\\d{4}-\\d{2}(-\\d{2})?$/.test(t) ? period(t) : t;
  function fact(k, v, d) { const b = el("div", "fact"); b.append(el("div", "k", k), el("div", "v", v)); if (d) b.append(el("div", "d", d)); return b; }
  function list(label, items) { if (!items.length) return []; const ul = el("ul", "lines"); for (const i of items) ul.append(el("li", "", i)); return [el("p", "label", label), ul]; }
  function onResult(d) {
    if (!d || !d.asset) { message("Nothing to show right now."); return; }
    const a = d.asset;
    $("title").textContent = "Evidence brief: " + a.name + " (" + a.symbol + ")";
    const grid = el("div", "grid");
    for (const f of d.facts || []) grid.append(fact(f.label, f.value, asOf(f.asOf)));
    const m = d.recentMove;
    if (m) grid.append(fact("Change over " + m.range, pct(m.changePct), usd(m.startUsd) + " to " + usd(m.endUsd)));
    const l = d.liquidity;
    if (l) grid.append(fact("Spread", l.spreadBps.toFixed(2) + " bp", "bid " + usd(l.bidUsd) + ", ask " + usd(l.askUsd)));
    const parts = [grid];
    parts.push(...list("The backdrop", (d.backdrop || []).map((b) => b.name + ": " + b.value + " for " + b.period + " (" + b.source + ")")));
    if (d.nextDecision) parts.push(...list("Next rate decision", [d.nextDecision.institution + ", " + day(d.nextDecision.date)]));
    parts.push(...list("Recent official releases", (d.news || []).slice(0, 3).map((n) => n.title + " (" + n.publisher + ")")));
    parts.push(...list("What people weigh", d.weigh || []));
    if ((d.terms || []).length) {
      parts.push(el("p", "label", "Terms to know"));
      const t = el("div", "terms");
      for (const term of d.terms) {
        const b = el("button", "term", term.title); b.type = "button";
        b.addEventListener("click", () => { $("readout").textContent = term.title + ": " + term.summary; reportSize(); tellClaude("The user opened the term " + term.title + " in the ATLAS Explain evidence brief on " + a.name + "."); });
        t.append(b);
      }
      parts.push(t);
    }
    if ((d.limits || []).length) { parts.push(el("p", "label", "What this brief doesn't tell you")); const ul = el("ul", "limits"); for (const x of d.limits) ul.append(el("li", "", x)); parts.push(ul); }
    $("plot").replaceChildren(...parts);
    askButtons($("asks"), [
      { label: "Make this a document", prompt: "Using ATLAS Explain's evidence_brief on " + a.name + ", write it up as a one-page document I can keep: the figures with their dates and sources, the backdrop, the terms explained, and what it doesn't tell me. No recommendation and no forecast." },
      { label: "Explain it simply", prompt: "Using ATLAS Explain, walk me through the evidence brief on " + a.name + " in plain language, one figure at a time, and define each term. No recommendation." },
    ]);
    reportSize();
  }
`,
});
