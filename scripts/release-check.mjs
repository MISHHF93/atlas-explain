// One-command release gate: npm run release:check
// GitHub Actions is billing-locked, so this is the gate before any deploy.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeVersionOk = () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = (major === 22 && minor >= 12) || major === 24;
  console.log(`${ok ? "✓" : "✗"} Node ${process.versions.node} (needs ^22.12 || ^24)`);
  return ok;
};

// Commands are plain words (no shell operators). On Windows a single command string goes
// through the shell so npm.cmd resolves; elsewhere npm is spawned directly.
function run(cmd, args) {
  const options = { cwd: root, stdio: "inherit" };
  const result =
    process.platform === "win32"
      ? spawnSync([cmd, ...args].join(" "), { ...options, shell: true })
      : spawnSync(cmd, args, options);
  return result.status === 0;
}

const steps = [
  ["node version", nodeVersionOk],
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
  const ok =
    typeof cmd === "function"
      ? cmd()
      : run(cmd, args);
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
