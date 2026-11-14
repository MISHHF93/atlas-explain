// Development tool (not part of the build). Proves a CSS change is visually neutral; see docs/ux/DESIGN_SYSTEM.md.
// node style-diff.mjs <port> <pageUrl> <newCssFile> [width]
// Loads the page, snapshots computed styles of every element, swaps in the new stylesheet
// (replacing every <link rel=stylesheet>), snapshots again, and prints any differences.
import { readFileSync } from "node:fs";
const [port, url, cssFile, width = "1440"] = process.argv.slice(2);
const newCss = readFileSync(cssFile, "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result.value;
await send("Emulation.setDeviceMetricsOverride", { width: +width, height: 900, deviceScaleFactor: 1, mobile: +width < 600 });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(4000);
await evaluate(`localStorage.setItem("atlas-explain-onboarded","1")`);
await send("Page.reload");
await sleep(7000);
// Freeze animations and transitions so mid-animation values don't show up as differences.
await evaluate(`(() => { const s = document.createElement("style"); s.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}"; document.head.append(s); })()`);
await sleep(300);
const snap = (store) => `(() => {
  const out = [];
  window.__els ??= [...document.querySelectorAll("*")];
  window.__els.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of cs) o[p] = cs.getPropertyValue(p);
    out.push([i + ":" + el.tagName + "." + (el.className && el.className.baseVal === undefined ? el.className : ""), o]);
  });
  window["${store}"] = out;
  return out.length;
})()`;
const beforeCount = await evaluate(snap("__before"));
const swapped = await evaluate(`(() => {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  links.forEach((l) => l.disabled = true);
  const s = document.createElement("style"); s.id = "new-css"; s.textContent = ${JSON.stringify(newCss)};
  document.head.prepend(s);
  return links.length;
})()`);
await sleep(500);
await evaluate(snap("__after"));
const result = await evaluate(`(() => {
  const a = window.__before, b = window.__after, lines = []; let n = 0;
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    const [name, x] = a[k]; const y = b[k][1];
    for (const p of Object.keys(x)) if (x[p] !== y[p]) { if (lines.length < 25) lines.push(name + " " + p + ": " + x[p] + " -> " + y[p]); n++; }
  }
  return { n, lines, sameLength: a.length === b.length };
})()`);
for (const l of result.lines) console.log(l);
console.log(`${url} @${width}: ${beforeCount} elements, ${swapped} stylesheet(s) swapped, ${result.n} computed-style differences${result.sameLength ? "" : " (element count changed)"}`);
ws.close();
await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
