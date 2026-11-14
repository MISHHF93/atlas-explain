// Development tool (not part of the build). See docs/ux/DESIGN_SYSTEM.md.
// Removes declarations that can never apply: a top-level rule's property P is dead when a LATER
// top-level rule with the identical selector list (same specificity, same media context: none)
// sets P again, and the earlier one is not !important while the later one is not weaker.
// Rules inside @media / @supports / @keyframes are left alone.
import fs from "node:fs";
const file = process.argv[2];
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
const css = raw.replace(/\r\n/g, "\n");

// Tokenise top-level rules with their spans.
const rules = [];
let depth = 0, i = 0, selStart = 0, inComment = false, inString = null;
for (; i < css.length; i++) {
  const c = css[i], n = css[i + 1];
  if (inComment) { if (c === "*" && n === "/") { inComment = false; i++; if (depth === 0) selStart = i + 1; } continue; }
  if (inString) { if (c === inString && css[i - 1] !== "\\") inString = null; continue; }
  if (c === "/" && n === "*") { inComment = true; i++; continue; }
  if (c === '"' || c === "'") { inString = c; continue; }
  if (c === "{") {
    if (depth === 0) rules.push({ selector: css.slice(selStart, i).trim(), open: i });
    depth++;
  } else if (c === "}") {
    depth--;
    if (depth === 0) { rules[rules.length - 1].close = i; selStart = i + 1; }
  } else if (c === ";" && depth === 0) selStart = i + 1;
}

const splitDecls = (body) => {
  const out = []; let d = 0, s = 0;
  for (let k = 0; k < body.length; k++) {
    if (body[k] === "(") d++; else if (body[k] === ")") d--;
    else if (body[k] === ";" && d === 0) { out.push(body.slice(s, k)); s = k + 1; }
  }
  if (body.slice(s).trim()) out.push(body.slice(s));
  return out;
};
const norm = (sel) => sel.replace(/\s+/g, " ").split(",").map((x) => x.trim()).join(", ");

const plain = rules.filter((r) => !r.selector.startsWith("@") && r.close != null && !css.slice(r.open + 1, r.close).includes("{"));
let removed = 0;
const edits = new Map(); // rule -> new body
for (let a = 0; a < plain.length; a++) {
  const r = plain[a];
  const later = plain.slice(a + 1).filter((x) => norm(x.selector) === norm(r.selector));
  if (!later.length) continue;
  const laterProps = new Set();
  for (const l of later) for (const d of splitDecls(css.slice(l.open + 1, l.close))) {
    const p = d.split(":")[0].trim().toLowerCase();
    if (p) laterProps.add(p + (/!important/.test(d) ? "!" : ""));
  }
  const decls = splitDecls(css.slice(r.open + 1, r.close));
  const kept = decls.filter((d) => {
    const p = d.split(":")[0].trim().toLowerCase();
    if (!p || p.startsWith("--")) return true; // keep custom properties: cheap and order-sensitive
    const important = /!important/.test(d);
    const dead = important ? laterProps.has(p + "!") : laterProps.has(p) || laterProps.has(p + "!");
    if (dead) removed++;
    return !dead;
  });
  if (kept.length !== decls.length) edits.set(r, kept);
}

// Rebuild from the end so offsets stay valid. Empty rules are removed entirely.
let out = css;
for (const r of [...edits.keys()].sort((x, y) => y.open - x.open)) {
  const kept = edits.get(r);
  if (kept.every((d) => !d.trim())) {
    const start = out.lastIndexOf("\n", r.open - r.selector.length - 1) + 1;
    out = out.slice(0, start) + out.slice(r.close + 1).replace(/^\n/, "");
  } else {
    const multiline = css.slice(r.open + 1, r.close).includes("\n");
    const body = multiline ? "\n" + kept.map((d) => "  " + d.trim() + ";").join("\n") + "\n" : " " + kept.map((d) => d.trim()).join("; ") + "; ";
    out = out.slice(0, r.open + 1) + body + out.slice(r.close);
  }
}
fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
console.log(`${file}: removed ${removed} dead declarations in ${edits.size} rules; ${raw.length} -> ${out.length} chars`);
