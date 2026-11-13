import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "extension", "dist");
const zipPath = join(root, "extension", "atlas-explain-chrome.zip");

if (!existsSync(join(dist, "popup.js")) || !existsSync(join(dist, "background.js"))) {
  console.error("extension/dist is missing popup.js or background.js. Run the Vite extension build first.");
  process.exit(1);
}

mkdirSync(dist, { recursive: true });
cpSync(join(root, "extension", "manifest.json"), join(dist, "manifest.json"));
rmSync(zipPath, { force: true });

// Pure Node zip so the build works on Windows, macOS, and Linux without a zip binary.
// The "key" field pins the unpacked extension id; the Chrome Web Store rejects it, so the zip drops it.
const entries = walk(dist).map((file) => {
  const name = relative(dist, file).split(sep).join("/");
  let data = readFileSync(file);
  if (name === "manifest.json") {
    const manifest = JSON.parse(data.toString("utf8"));
    delete manifest.key;
    data = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { name, data, mtime: statSync(file).mtime };
});
const zip = createZip(entries);
writeFileSync(zipPath, zip);
console.log(`${zipPath} (${entries.length} files)`);

// The website offers the same zip at /download/atlas-explain-chrome.zip until the Chrome Web Store
// listing is live. Only written when the web build exists (dist/index.html), so it ships with hosting.
if (existsSync(join(root, "dist", "index.html"))) {
  mkdirSync(join(root, "dist", "download"), { recursive: true });
  writeFileSync(join(root, "dist", "download", "atlas-explain-chrome.zip"), zip);
  console.log("dist/download/atlas-explain-chrome.zip (for the website)");
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
