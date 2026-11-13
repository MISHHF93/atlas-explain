// npm "version" hook: keep extension/manifest.json in step with package.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const path = join(root, "extension", "manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.version = version;
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`extension/manifest.json → ${version}`);
