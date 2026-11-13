import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "extension", "dist");
const zipPath = join(root, "extension", "atlas-explain-chrome.zip");
cpSync(join(root, "extension", "manifest.json"), join(dist, "manifest.json"));
rmSync(zipPath, { force: true });
mkdirSync(dist, { recursive: true });
execFileSync("zip", ["-r", zipPath, "."], { cwd: dist, stdio: "inherit" });
console.log(zipPath);
