import { readFileSync } from "node:fs";
import { applySiteFrame } from "../src/site/frame";

/** A public site page as the build serves it: the shared header and footer filled in. */
export function sitePage(file: string): string {
  return applySiteFrame(readFileSync(file, "utf8"));
}

/** The public site since 23 Nov 2026: Home (with setup and questions), Partners (with How it's built), Privacy, Terms. */
export const SITE_PAGES = ["index.html", "partners.html", "privacy.html", "terms.html", "404.html"] as const;
