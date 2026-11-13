// Versioned Chrome Web Store package.
//   npm version patch            # bumps package.json and extension/manifest.json together
//   npm run release:extension    # builds and writes release/atlas-explain-chrome-v<version>.zip + .sha256
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkManifest, extensionSource } from "./check-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "extension", "manifest.json"), "utf8"));
const built = JSON.parse(readFileSync(join(root, "extension", "dist", "manifest.json"), "utf8"));

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail(`package.json version ${pkg.version} is not a Chrome version (x.y.z)`);
if (manifest.version !== pkg.version) fail(`extension/manifest.json is ${manifest.version} but package.json is ${pkg.version}; run "npm version <x.y.z>"`);
if (built.version !== pkg.version) fail("extension/dist is stale; run npm run build:extension first");
const problems = checkManifest(manifest, extensionSource(root));
if (problems.length) fail(problems.join("; "));

const outDir = join(root, "release");
mkdirSync(outDir, { recursive: true });
const name = `atlas-explain-chrome-v${pkg.version}.zip`;
const out = join(outDir, name);
copyFileSync(join(root, "extension", "atlas-explain-chrome.zip"), out);
const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
writeFileSync(`${out}.sha256`, `${sha}  ${name}\n`);
console.log(`✓ ${out}\n  sha256 ${sha}`);
