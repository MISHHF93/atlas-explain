// The release gate's dependency audit: npm audit at every severity, with one narrow escape hatch.
//  1. Anything that ships (production dependencies) must have no advisory at all.
//  2. Dev-only tools (build, test, lint) must have none either, except an advisory listed below: one with no
//     patched release yet, reviewed and judged not reachable here, with a date after which the gate fails
//     again so it is looked at once more.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ACCEPTED = [
  {
    advisory: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    until: "2026-12-31",
    why:
      "ReDoS from crafted glob patterns, published 19 Oct 2026 with no patched release (all versions to 4.0.7). " +
      "picomatch is used only by vite, vitest and typescript-eslint on this repo's own fixed globs; nothing that ships " +
      "uses it and no outside input reaches a glob.",
  },
];

function audit(extra) {
  const args = ["audit", "--json", ...extra];
  const r = process.platform === "win32"
    ? spawnSync(["npm", ...args].join(" "), { cwd: root, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    : spawnSync("npm", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    console.error("npm audit gave no readable answer:", (r.stderr || r.stdout || "").slice(0, 500));
    process.exit(1);
  }
}

/** Every advisory id behind the report's vulnerabilities, with the package it is in. */
function advisories(report) {
  const found = new Map();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "object" && via.url) found.set(via.url.split("/").pop(), via.name);
    }
  }
  return found;
}

const shipped = advisories(audit(["--omit=dev"]));
if (shipped.size) {
  console.error(`✗ Production dependencies have advisories: ${[...shipped].map(([id, pkg]) => `${id} (${pkg})`).join(", ")}`);
  process.exit(1);
}
console.log("✓ Production dependencies: no advisories.");

const today = new Date().toISOString().slice(0, 10);
const all = advisories(audit([]));
const problems = [];
for (const [id, pkg] of all) {
  const ok = ACCEPTED.find((a) => a.advisory === id && a.package === pkg);
  if (!ok) problems.push(`${id} (${pkg}) is not reviewed`);
  else if (today > ok.until) problems.push(`${id} (${pkg}) was accepted until ${ok.until}; review it again`);
  else console.log(`! Dev-only ${id} (${pkg}) accepted until ${ok.until}: ${ok.why}`);
}
if (problems.length) {
  console.error(`✗ Dev dependencies: ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`✓ Dev dependencies: ${all.size ? "only reviewed, unpatched advisories" : "no advisories"}.`);
