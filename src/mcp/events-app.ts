/**
 * The view upcoming_events draws inside the chat (an MCP App; frame and bridge in ./app-shell): a timeline of
 * the next rate decisions and US data releases, each with its time in the reader's own time zone, how long
 * until it, and, on a click, what each possible outcome would mean. Explains outcomes; never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const EVENTS_APP_URI = "ui://atlas-explain/coming-up.html";

export const EVENTS_APP_HTML = appPage({
  name: "atlas-explain-coming-up",
  title: "ATLAS Explain: coming up",
  css: `
  .timeline { margin: 12px 0 0; padding: 0 0 0 14px; list-style: none; border-left: 2px solid var(--line); display: grid; gap: 10px; }
  .ev { position: relative; padding: 6px 10px; border-radius: var(--radius); cursor: pointer; }
  .ev::before { content: ""; position: absolute; left: -21px; top: 12px; width: 10px; height: 10px; border-radius: 50%; background: var(--card); border: 2px solid var(--accent); }
  .ev:hover, .ev[aria-expanded="true"] { background: var(--soft); }
  .ev:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ev .when { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .ev .left { font-weight: 600; color: var(--fg); }
  .ev h2 { margin-top: 2px; line-height: 1.35; }
  .ev .ctx { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
  .ev .more { display: none; margin-top: 8px; font-size: 12px; }
  .ev[aria-expanded="true"] .more { display: block; }
  .ev .more p { margin: 4px 0 0; }
  .ev .more b { font-weight: 600; }
  .ev .caution { color: var(--muted); }`,
  body: `  <header>
    <div><h1>Coming up</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line short"></div></div></div>
  <div class="asks" id="asks"></div>`,
  footer: "Dates and times from each publisher's own calendar. What each outcome would mean, never a forecast of which one happens.",
  script: `
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function until(t) {
    const ms = new Date(t).getTime() - Date.now();
    if (ms <= 0) return "now or just passed";
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return "in " + (d ? d + (d === 1 ? " day, " : " days, ") + h + (h === 1 ? " hour" : " hours") : h ? h + (h === 1 ? " hour, " : " hours, ") + m + " min" : m + " min");
  }
  const full = (t) => new Date(t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  function card(e) {
    const li = el("li", "ev");
    li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-expanded", "false");
    const when = el("div", "when", full(e.time) + " \\u00b7 ");
    when.append(el("span", "left", until(e.time)));
    li.append(when, el("h2", "", e.title));
    if (e.context) li.append(el("p", "ctx", e.context));
    const more = el("div", "more");
    if (e.about) more.append(el("p", "", e.about));
    const sc = e.scenarios;
    if (sc && Array.isArray(sc.outcomes)) {
      more.append(el("p", "", "If this happens:"));
      for (const o of sc.outcomes) { const p = el("p"); p.append(el("b", "", o.outcome + ": "), o.meaning); more.append(p); }
      if (sc.caution) more.append(el("p", "caution", sc.caution));
    }
    more.append(el("p", "caution", "Source: " + e.who + (e.sourceUrl ? " (" + e.sourceUrl + ")" : "")));
    li.append(more);
    const toggle = () => {
      const open = li.getAttribute("aria-expanded") !== "true";
      li.setAttribute("aria-expanded", String(open));
      reportSize();
      if (open) tellClaude("The user opened " + e.title + " (" + full(e.time) + ", " + until(e.time) + ") in the ATLAS Explain coming-up view.");
    };
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", (k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); toggle(); } });
    return li;
  }
  function onResult(d) {
    if (!d || !Array.isArray(d.events)) { message("Nothing to show right now."); return; }
    if (!d.events.length) { message("Nothing scheduled in the calendars ATLAS Explain reads."); return; }
    $("sub").textContent = "Times in your time zone. Select an event for what each outcome would mean.";
    const ul = el("ol", "timeline");
    ul.append(...d.events.map(card));
    $("plot").replaceChildren(ul);
    const first = d.events[0];
    askButtons($("asks"), [
      { label: "Explain the next one", prompt: "Using ATLAS Explain's upcoming_events, explain " + first.title + " in plain language: what it measures or decides, when it is, and what each possible outcome would mean. Don't forecast which one happens." },
      { label: "Make a calendar sheet", prompt: "Using ATLAS Explain's upcoming_events, make a one-page calendar of these events (date, time in my time zone, who publishes it, and one line on why it matters), with sources, as a document or artifact I can keep. No forecasts." },
    ]);
    reportSize();
  }
`,
});
