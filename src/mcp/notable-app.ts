/**
 * The view notable_today draws inside the chat (an MCP App; frame and bridge in ./app-shell): one card
 * per item that passed a rule (what happened, the detail, why it was picked, its source and the terms
 * behind it), then what was checked and found ordinary, and what couldn't be checked. Describes the
 * past only, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const NOTABLE_APP_URI = "ui://atlas-explain/notable-today.html";

export const NOTABLE_APP_HTML = appPage({
  name: "atlas-explain-notable-today",
  title: "ATLAS Explain: what's notable today",
  css: `
  .items { display: grid; gap: 8px; margin: 10px 0 0; padding: 0; list-style: none; }
  .item { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; cursor: pointer; }
  .item:hover, .item[aria-expanded="true"] { background: var(--soft); }
  .item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .kind { display: inline-block; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .item h2 { margin-top: 2px; line-height: 1.35; }
  .item .detail { margin: 4px 0 0; font-size: 13px; }
  .item .more { display: none; margin-top: 6px; font-size: 12px; color: var(--muted); }
  .item[aria-expanded="true"] .more { display: block; }
  .item .more p { margin: 3px 0 0; }
  .terms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .term { font-size: 11px; padding: 2px 8px; border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--fg); }
  .quiet { margin: 12px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
  .quiet li + li { margin-top: 3px; }
  .label { margin: 12px 0 0; font-size: 12px; font-weight: 600; }`,
  body: `  <header>
    <div><h1>What's notable today</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line short"></div></div></div>
  <div class="asks" id="asks"></div>
  <p class="label" id="quiet-label" hidden>Checked, nothing unusual</p>
  <ul class="quiet" id="quiet"></ul>
  <p class="label" id="na-label" hidden>Not checked</p>
  <ul class="quiet" id="na"></ul>`,
  footer: "Each item was picked by the rule shown with it; it describes the past, never a forecast.",
  script: `
  const KIND = { crypto_move: "Crypto move", yield_curve: "Yield curve", rate_decision: "Rate decision", economic_change: "Economic figure", official_release: "Official release" };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function list(host, label, items) {
    $(label).hidden = !items.length;
    $(host).replaceChildren(...items.map((t) => el("li", "", t)));
  }
  function card(o) {
    const li = el("li", "item");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-expanded", "false");
    const more = el("div", "more");
    more.append(el("p", "", "Why it's here: " + o.rule), el("p", "", "Source: " + o.source + (o.asOf ? " (" + when(o.asOf) + ")" : "")));
    if (o.terms && o.terms.length) {
      const terms = el("div", "terms");
      for (const t of o.terms) terms.append(el("span", "term", t.title));
      more.append(terms);
    }
    li.append(el("span", "kind", KIND[o.kind] || "Notable"), el("h2", "", o.title), el("p", "detail", o.detail), more);
    const toggle = () => {
      const open = li.getAttribute("aria-expanded") !== "true";
      li.setAttribute("aria-expanded", String(open));
      reportSize();
      if (open) tellClaude("The user opened this item in the ATLAS Explain notable-today view: " + o.title + ". " + o.detail + " Picked because: " + o.rule + " Source: " + o.source + ".");
    };
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    return li;
  }
  function onResult(d) {
    if (!d || !Array.isArray(d.observations)) { message("Nothing to show right now."); return; }
    $("sub").textContent = (d.asOf ? "As of " + when(d.asOf) + ". " : "") + "Select an item for why it was picked and its source.";
    const obs = d.observations;
    if (obs.length) {
      const ul = el("ul", "items");
      ul.append(...obs.map(card));
      $("plot").replaceChildren(ul);
    } else message("Nothing passed the rules today.");
    list("quiet", "quiet-label", d.quiet || []);
    list("na", "na-label", d.unavailable || []);
    const first = obs[0];
    const term = obs.flatMap((o) => o.terms || [])[0];
    const asks = [];
    if (first) asks.push({ label: "Explain the first item", prompt: "Using ATLAS Explain, explain in plain language what this means and why it matters for understanding markets: " + first.title + ". " + first.detail + " Keep the source (" + first.source + ") and don't forecast anything." });
    if (term) asks.push({ label: "Teach me: " + term.title, prompt: "Using ATLAS Explain, explain the term \\"" + term.title + "\\" (explain_term) with a real example from today's data, then ask me one short question to check I understood." });
    askButtons($("asks"), asks);
    reportSize();
  }
`,
});
