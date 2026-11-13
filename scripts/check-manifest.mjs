// Least-privilege check for the Chrome extension manifest.
// Run directly (`node scripts/check-manifest.mjs`) or import checkManifest() from tests.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Every permission must be listed here with the chrome.* API that needs it. */
export const ALLOWED_PERMISSIONS = {
  activeTab: null, // grants temporary access to the tab the user clicked on; no API call of its own
  contextMenus: "chrome.contextMenus",
  storage: "chrome.storage",
  scripting: "chrome.scripting",
};
export const ALLOWED_OPTIONAL_PERMISSIONS = { sidePanel: "chrome.sidePanel" };
/** The only host the extension may read: the user's own ATLAS desk. */
export const ALLOWED_HOSTS = ["http://localhost:3000/*"];

export function checkManifest(manifest, source) {
  const problems = [];
  if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
  for (const p of manifest.permissions ?? []) {
    if (!(p in ALLOWED_PERMISSIONS)) problems.push(`permission "${p}" is not on the least-privilege allowlist`);
    else if (ALLOWED_PERMISSIONS[p] && !source.includes(ALLOWED_PERMISSIONS[p])) problems.push(`permission "${p}" is declared but ${ALLOWED_PERMISSIONS[p]} is never used`);
  }
  for (const p of manifest.optional_permissions ?? []) {
    if (!(p in ALLOWED_OPTIONAL_PERMISSIONS)) problems.push(`optional permission "${p}" is not allowlisted`);
    else if (!source.includes(ALLOWED_OPTIONAL_PERMISSIONS[p])) problems.push(`optional permission "${p}" is never used`);
  }
  for (const h of manifest.host_permissions ?? []) {
    if (!ALLOWED_HOSTS.includes(h)) problems.push(`host permission "${h}" is broader than the local ATLAS desk`);
  }
  for (const key of ["content_scripts", "web_accessible_resources", "externally_connectable", "optional_host_permissions"]) {
    if (manifest[key] != null) problems.push(`"${key}" widens the extension's reach; inject on demand with activeTab + scripting instead`);
  }
  const csp = manifest.content_security_policy?.extension_pages ?? "";
  if (!csp) problems.push("content_security_policy.extension_pages must be set explicitly");
  if (/unsafe-eval|unsafe-inline|https?:/.test(csp)) problems.push("extension CSP must not allow eval, inline script or remote script");
  return problems;
}

export function extensionSource(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|mts|js)$/.test(name)) out.push(readFileSync(full, "utf8"));
    }
  };
  walk(join(root, "extension", "src"));
  return out.join("\n");
}

const isMain = (() => {
  const self = resolve(fileURLToPath(import.meta.url));
  const entry = process.argv[1] ? resolve(process.argv[1]) : "";
  return process.platform === "win32" ? self.toLowerCase() === entry.toLowerCase() : self === entry;
})();

if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(readFileSync(join(root, "extension", "manifest.json"), "utf8"));
  const problems = checkManifest(manifest, extensionSource(root));
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log(`✓ manifest least-privilege: ${manifest.permissions.join(", ")} + host ${manifest.host_permissions.join(", ")}`);
}
