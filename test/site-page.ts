import { readFileSync } from "node:fs";
import { applySiteFrame } from "../src/site/frame";

/** A public site page as the build serves it: the shared header and footer filled in. */
export function sitePage(file: string): string {
  return applySiteFrame(readFileSync(file, "utf8"));
}

export const SITE_PAGES = ["index.html", "connect.html", "how-its-built.html", "welcome.html", "privacy.html", "terms.html", "support.html", "404.html"] as const;
