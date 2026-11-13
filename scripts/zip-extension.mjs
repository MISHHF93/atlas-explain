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
const entries = walk(dist).map((file) => ({
  name: relative(dist, file).split(sep).join("/"),
  data: readFileSync(file),
  mtime: statSync(file).mtime,
}));
writeFileSync(zipPath, createZip(entries));
console.log(`${zipPath} (${entries.length} files)`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
