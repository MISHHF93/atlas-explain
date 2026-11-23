/**
 * The learning hub view learning_hub draws inside the chat (MCP Apps; frame and bridge in ./app-shell):
 * the learning path, "Check yourself" questions on each topic, and spaced review (1, 7 and 28 days).
 * Questions come from learning_check, a tool only this view calls (_meta.ui.visibility ["app"]), so
 * Claude's own tool list stays short. Progress stays in the view's storage on the person's device;
 * nothing about the person is sent anywhere.
 */
import { REVIEW_DAYS } from "../core/review";
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const LEARNING_APP_URI = "ui://atlas-explain/learning-hub.html";
/** Where the view keeps progress: { topicId: { stage, due } }, the same shape as src/core/review.ts. */
export const LEARNING_STORE_KEY = "atlas-explain-review";

const CSS = `
  .topics { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
  .topic { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); }
  .topic.due { border-color: var(--accent); }
  .topic b { font-weight: 600; font-size: 13px; }
  .topic .st { grid-column: 1; font-size: 12px; color: var(--muted); }
  .topic button { grid-row: 1 / span 2; grid-column: 2; }
  .btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill); font-size: 13px; font-weight: 600; color: var(--fg); }
  .btn:hover { background: var(--soft); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .lead { margin: 10px 0 0; font-size: 13px; }
  .q { margin: 12px 0 0; font-size: 14px; line-height: 1.5; }
  .count { font-size: 12px; color: var(--muted); margin-top: 10px; }
  .opts { display: grid; gap: 6px; margin-top: 10px; }
  .opt { all: unset; cursor: pointer; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }
  .opt:hover:not([disabled]) { background: var(--soft); }
  .opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .opt.right { border-color: var(--up); color: var(--up); font-weight: 600; }
  .opt.wrong { border-color: var(--down); color: var(--down); }
  .opt[disabled] { cursor: default; }
  .feedback { margin-top: 10px; font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .fine { font-size: 12px; color: var(--muted); margin: 8px 0 0; }`;

export const LEARNING_APP_HTML = appPage({
  name: "atlas-explain-learning-hub",
  title: "ATLAS Explain learning hub",
  css: CSS,
  body: `  <header>
    <div><h1 id="title">Learning path</h1><p class="sub" id="sub">Check yourself on each topic; passed topics come back for review.</p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot" class="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div></div></div>
  <div class="asks" id="asks"></div>`,
  footer: "Questions come from the ATLAS Explain glossary; it teaches terms, never a forecast. Progress stays on this device.",
  script: `
  const DAYS = ${JSON.stringify(REVIEW_DAYS)};
  const DAY = 86400000;
  const KEY = "atlas-explain-review";
  let hub = null;
  let state = {};
  let stored = false;
  try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) || {} : {}; stored = true; } catch { state = {}; }
  if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); stored = true; } catch { stored = false; } }
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (label, cls, fn) => { const b = node("button", cls, label); b.type = "button"; b.addEventListener("click", fn); return b; };
  const dayName = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const isDue = (id) => state[id] && state[id].due && Date.parse(state[id].due) <= Date.now();
  /** Same rule as src/core/review.ts recordCheck: two of three to pass; a pass moves to the next review, a missed review starts again. */
  function record(topic, right, total) {
    const prev = state[topic];
    const pass = right >= Math.ceil(total * 2 / 3);
    if (pass) {
      const stage = prev ? Math.min(prev.stage + 1, DAYS.length) : 0;
      const d = DAYS[stage];
      state[topic] = { stage, due: d === undefined ? null : new Date(Date.now() + d * DAY).toISOString() };
    } else if (prev) {
      state[topic] = { stage: 0, due: new Date(Date.now() + DAYS[0] * DAY).toISOString() };
    }
    save();
    return pass;
  }
  function status(id) {
    const s = state[id];
    if (!s) return "Not checked yet";
    if (s.due == null) return "Kept: every review done";
    if (isDue(id)) return "Due for review now";
    return "Passed; next review " + dayName(s.due);
  }
  function home() {
    $("title").textContent = "Learning path";
    const steps = hub.steps;
    const passed = steps.filter((s) => state[s.id]).length;
    const due = steps.filter((s) => isDue(s.id));
    $("sub").textContent = passed + " of " + steps.length + " topics passed" + (due.length ? "; " + due.length + " due for review" : "") + ".";
    const list = node("ul", "topics");
    const ordered = due.concat(steps.filter((s) => !isDue(s.id)));
    for (const s of ordered) {
      const li = node("li", "topic" + (isDue(s.id) ? " due" : ""));
      li.append(node("b", "", s.title + " (" + s.terms.length + (s.terms.length === 1 ? " term)" : " terms)")), node("span", "st", status(s.id)));
      li.append(button(isDue(s.id) ? "Review" : state[s.id] ? "Check again" : "Check yourself", isDue(s.id) ? "btn primary" : "btn", () => check(s.id)));
      list.append(li);
    }
    const parts = [node("p", "lead", "Three quick questions per topic, from the glossary. Pass two of three and the topic comes back for review in " + DAYS.join(", then ") + " days: going over things again later is what makes them stick.")];
    parts.push(list);
    if (!stored) parts.push(node("p", "fine", "This chat doesn't let the view keep progress, so it lasts while the view is open."));
    $("plot").replaceChildren(...parts);
    const next = ordered[0];
    askButtons($("asks"), [
      { label: "Teach me the next topic", prompt: "Using ATLAS Explain's learn_next, teach me the \\"" + (steps.find((s) => !state[s.id]) || next).title + "\\" topic of the learning path, term by term." },
    ]);
    reportSize();
  }
  async function check(topic) {
    const step = hub.steps.find((s) => s.id === topic);
    if (!step) return home();
    $("title").textContent = step.title;
    $("sub").textContent = "Check yourself";
    $("plot").replaceChildren(node("p", "msg", "Getting the questions…"));
    reportSize();
    const r = await callTool("learning_check", { topic, seed: Math.floor(Math.random() * 1e9) });
    if (!r || !r.questions || !r.questions.length) {
      $("plot").replaceChildren(node("p", "msg", "The questions couldn't be loaded in this view."), button("Back to the path", "btn", home));
      askButtons($("asks"), [{ label: "Quiz me in the chat", prompt: "Using ATLAS Explain's quiz_me, quiz me on the \\"" + step.title + "\\" topic of the learning path." }]);
      return;
    }
    $("asks").replaceChildren();
    let i = 0, right = 0;
    const missed = [];
    const show = () => {
      const q = r.questions[i];
      const opts = node("div", "opts");
      const fb = node("div", "feedback");
      fb.setAttribute("aria-live", "polite");
      const row = node("div", "row");
      for (const o of q.options) {
        const b = button(o.title, "opt", () => {
          const ok = o.id === q.answerId;
          if (ok) right++; else missed.push(q.options.find((x) => x.id === q.answerId).title);
          for (const x of opts.children) { x.disabled = true; if (x.dataset.id === q.answerId) x.classList.add("right"); }
          if (!ok) b.classList.add("wrong");
          const term = step.terms.find((t) => t.id === q.answerId);
          fb.replaceChildren(node("b", "", ok ? "Right. " : "Not quite: it's " + term.title + ". "), document.createTextNode(term.summary));
          row.replaceChildren(button(i + 1 < r.questions.length ? "Next question" : "See how I did", "btn primary", () => { i++; i < r.questions.length ? show() : finish(); }));
          reportSize();
        });
        b.dataset.id = o.id;
        opts.append(b);
      }
      $("plot").replaceChildren(node("p", "count", "Question " + (i + 1) + " of " + r.questions.length + ": which term is this?"), node("p", "q", q.prompt), opts, fb, row);
      reportSize();
    };
    const finish = () => {
      const total = r.questions.length;
      const wasDue = isDue(topic);
      const pass = record(topic, right, total);
      const s = state[topic];
      const after = pass ? (s.due ? "Passed. Next review " + dayName(s.due) + "." : "Passed, and every review is done: this one's kept.") : (s ? "Not this time; it comes back tomorrow to try again." : "Not this time. Read the terms again, then try once more.");
      $("sub").textContent = right + " of " + total + " right";
      $("plot").replaceChildren(node("p", "lead", right + " of " + total + " right. " + after), node("div", "row"));
      $("plot").lastChild.append(button("Back to the path", "btn primary", home), button("Try different questions", "btn", () => check(topic)));
      tellClaude("In the ATLAS Explain learning hub the user " + (wasDue ? "reviewed" : "checked themselves on") + " \\"" + step.title + "\\": " + right + " of " + total + " right. " + after + (missed.length ? " Missed: " + missed.join(", ") + "." : ""));
      askButtons($("asks"), missed.length
        ? [{ label: "Explain the ones I missed", prompt: "Using ATLAS Explain's explain_term, explain these in plain language with a simple example each: " + missed.join(", ") + "." }]
        : [{ label: "Teach me the next topic", prompt: "Using ATLAS Explain's learn_next, teach me the next topic of the learning path after \\"" + step.title + "\\"." }]);
      reportSize();
    };
    show();
  }
  function onResult(d) {
    if (!d || !d.steps || !d.steps.length) { message(d && d.error ? d.error : "Nothing to show."); return; }
    hub = d;
    if (d.topic && d.steps.some((s) => s.id === d.topic)) check(d.topic); else home();
  }
`,
});
