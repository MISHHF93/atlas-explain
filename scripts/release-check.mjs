// One-command release gate: npm run release:check
// GitHub Actions is billing-locked, so this is the gate before any deploy.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  ["node version", "node", ["-e", "const [M,m]=process.versions.node.split('.').map(Number);if(!((M===22&&m>=12)||M===24)){console.error('Node '+process.versions.node+' is outside ^22.12 || ^24');process.exit(1)}"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["lint", "npm", ["run", "lint"]],
  ["test", "npm", ["test"]],
  ["build (web)", "npm", ["run", "build"]],
  ["build:extension", "npm", ["run", "build:extension"]],
  ["manifest least-privilege", "node", ["scripts/check-manifest.mjs"]],
  ["bundle budget", "node", ["scripts/bundle-budget.mjs"]],
  ["npm audit", "npm", ["audit", "--audit-level=low"]],
  ["trade-word scan", "node", ["scripts/trade-word-scan.mjs"]],
];

const results = [];
for (const [name, cmd, args] of steps) {
  const started = Date.now();
  console.log(`\n▶ ${name}`);
  const run = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const ok = run.status === 0;
  results.push([name, ok, ((Date.now() - started) / 1000).toFixed(1)]);
  if (!ok) break;
}

console.log("\nrelease:check");
for (const [name, ok, s] of results) console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(26)} ${s}s`);
const failed = results.find(([, ok]) => !ok);
if (failed || results.length !== steps.length) {
  console.error(`\n✗ release:check failed at "${failed?.[0]}". Do not deploy.`);
  process.exit(1);
}
console.log("\n✓ release:check passed. Safe to deploy hosting and package the extension.");
