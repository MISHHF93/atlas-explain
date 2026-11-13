// Bundle-size budget for the web app and the extension. Run after both builds.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_CHUNK_KB = 500;
/** The parts that load before anything is clicked must stay small. */
export const ENTRY_BUDGETS_KB = [
  { label: "extension popup.js", match: /^extension\/dist\/popup\.js$/, max: 120 },
  { label: "extension background.js", match: /^extension\/dist\/background\.js$/, max: 20 },
  { label: "web entry index-*.js", match: /^dist\/assets\/index-[^/]+\.js$/, max: 150 },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const problems = [];
const rows = [];
for (const dir of ["dist", "extension/dist"]) {
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
      if (b.match.test(rel) && kb > b.max) problems.push(`${b.label} is ${kb.toFixed(1)} kB (budget ${b.max} kB)`);
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
