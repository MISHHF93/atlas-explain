// Bundle-size budget for the web app. Run after npm run build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_CHUNK_KB = 500;
/**
 * The parts that load before anything is clicked must stay small. Each budget counts the entry
 * file plus every chunk it imports statically (what the browser downloads before first paint),
 * so moving code between the entry and a shared chunk can't hide or fake a change.
 * The web app's first load was 183 kB on 15 Nov 2026 before the extension was removed, 182 kB after.
 */
export const ENTRY_BUDGETS_KB = [
  { label: "web app first load (app-*.js and its static imports)", match: /^dist\/assets\/app-[^/]+\.js$/, max: 190 },
  { label: "public site first load (site-*.js and its static imports)", match: /^dist\/assets\/site-[^/]+\.js$/, max: 10 },
];

/** Bytes of a chunk plus everything it imports statically (`from"./x.js"` in the built output). */
function firstLoadBytes(file) {
  const seen = new Set();
  const todo = [file];
  let total = 0;
  while (todo.length) {
    const current = todo.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const text = readFileSync(current, "utf8");
    total += Buffer.byteLength(text);
    for (const m of text.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) todo.push(join(dirname(current), m[1]));
  }
  return total;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const problems = [];
const rows = [];
for (const dir of ["dist"]) {
  let files;
  try {
    files = walk(join(root, dir)).filter((f) => f.endsWith(".js"));
  } catch {
    problems.push(`${dir} is missing; build first`);
    continue;
  }
  for (const file of files) {
    const rel = relative(root, file).split("\\").join("/");
    const kb = readFileSync(file).length / 1000;
    rows.push([rel, kb]);
    if (kb > MAX_CHUNK_KB) problems.push(`${rel} is ${kb.toFixed(1)} kB (max ${MAX_CHUNK_KB} kB per chunk)`);
    for (const b of ENTRY_BUDGETS_KB) {
      if (!b.match.test(rel)) continue;
      const first = firstLoadBytes(file) / 1000;
      console.log(`  ${b.label}: ${first.toFixed(1)} kB (budget ${b.max} kB)`);
      if (first > b.max) problems.push(`${b.label} is ${first.toFixed(1)} kB (budget ${b.max} kB)`);
    }
  }
}
rows.sort((a, b) => b[1] - a[1]);
for (const [rel, kb] of rows.slice(0, 6)) console.log(`  ${kb.toFixed(1).padStart(7)} kB  ${basename(dirname(rel))}/${basename(rel)}`);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ bundle budget: ${rows.length} JS files, largest ${rows[0]?.[1].toFixed(1)} kB (≤ ${MAX_CHUNK_KB} kB)`);
