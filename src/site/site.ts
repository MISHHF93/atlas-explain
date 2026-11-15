import { legacyRedirect } from "../app/routes";
import { CHROME_STORE_URL, MCP_URL } from "../core/links";
import "./site.css";

/*
 * Public site pages (/, /support, /privacy, /terms, 404). Static HTML; this tiny script
 * only forwards links made for the old single-page app (desk links, extension sign-in,
 * email sign-in links, preview flags) to their new address under /app.
 */
const target = legacyRedirect(location);
if (target) location.replace(target);

/*
 * Everything installs online. Pages ship "not available yet" text, and the real buttons appear only
 * once the owner sets the Chrome Web Store listing or the hosted MCP address (src/core/links.ts).
 */
function switchOn(when: string, before: string, url: string | null, linkAttr: string): void {
  if (!url) return;
  document.querySelectorAll<HTMLElement>(`[${before}]`).forEach((n) => (n.hidden = true));
  document.querySelectorAll<HTMLElement>(`[${when}]`).forEach((n) => (n.hidden = false));
  document.querySelectorAll<HTMLElement>(`[${linkAttr}]`).forEach((n) => {
    if (n instanceof HTMLAnchorElement) n.href = url;
    else n.textContent = url;
  });
}
switchOn("data-when-store", "data-before-store", CHROME_STORE_URL, "data-store-link");
switchOn("data-when-mcp", "data-before-mcp", MCP_URL, "data-mcp-url");

// Opened by the extension right after install (/welcome?installed=1): confirm it instead of offering "Add to Chrome".
if (new URLSearchParams(location.search).get("installed") === "1") {
  const add = document.querySelector<HTMLAnchorElement>(".site-head .btn-primary");
  if (add) {
    const done = document.createElement("span");
    done.className = "installed-chip";
    done.textContent = "Installed";
    add.replaceWith(done);
  }
}
