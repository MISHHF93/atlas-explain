import { legacyRedirect } from "../app/routes";
import "./site.css";

/*
 * Public site pages (/, /how-it-works, /privacy, /terms, 404). Static HTML; this tiny script
 * only forwards links made for the old single-page app (desk links, extension sign-in,
 * email sign-in links, preview flags) to their new address under /app.
 */
const target = legacyRedirect(location);
if (target) location.replace(target);
