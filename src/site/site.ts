import { legacyRedirect } from "../app/routes";
import "./site.css";

/*
 * Public site pages (/, /support, /privacy, /terms, /welcome, /how-its-built, 404). Static HTML with
 * the shared header and footer filled in at build time (src/site/frame.ts). This tiny script
 * only forwards links made for the old single-page app (desk links, extension sign-in,
 * email sign-in links, preview flags) to their new address under /app.
 */
const target = legacyRedirect(location);
if (target) location.replace(target);

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
