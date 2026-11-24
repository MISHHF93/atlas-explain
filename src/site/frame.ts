/**
 * The one header and footer of the public site pages (/, /partners, /privacy, /terms, 404). Since 23 Nov 2026
 * the home page also holds the connector setup and the questions (the old /connect and /support), and /partners
 * holds How it's built; the old addresses redirect (firebase.json). Each page holds only `<!-- site:header -->` and `<!-- site:footer -->`
 * markers; the build (vite.config.ts) and the tests (applySiteFrame) put this markup in, so the
 * pages can never drift apart again.
 *
 * Connector first (24 Nov 2026): the header's button is "Add to your AI assistant" (/#setup, public setup
 * steps, no account). The web app (/app, sign-in first) is in the footer and the home page's hero.
 * Signed in on this browser, the hero's app link reads "Open ATLAS Explain" and your initials link to
 * your account (src/site/site.ts). There is no separate "Sign in" or "The app" link: they led to the
 * same place.
 */
import { DATA_SITE_URL, EDUCATION_LINE, MCP_URL } from "../core/links.ts";

export type SitePage = "home" | "partners" | "privacy" | "terms" | "404";

const SOURCE_URL = "https://github.com/MISHHF93/atlas-explain";

const NAV: readonly { href: string; label: string; page?: SitePage }[] = [
  { href: "/#setup", label: "Set it up" },
  { href: "/#questions", label: "Questions" },
  { href: "/partners", label: "Partners", page: "partners" },
];

/** Every public destination, once. */
const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/app", label: "Try it in your browser" },
  { href: "/#setup", label: "Add to your AI assistant" },
  { href: "/#questions", label: "Questions and support" },
  { href: "/partners", label: "For businesses and developers" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/** The main way in, on every page: the connector's setup steps. The web app is in the footer and the home page's hero. */
export function connectCta(className: string): string {
  return `<a class="${className}" href="/#setup">Add to your AI assistant</a>`;
}


export function siteHeader(page: SitePage): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.page === page ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return [
    `<header class="site-head">`,
    `      <a class="brand" href="/" aria-label="ATLAS Explain home"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>ATLAS</b> Explain</span></a>`,
    `      <nav class="site-nav" aria-label="Site">${nav}</nav>`,
    // Signed in on this browser: site.ts shows your initials here, linking to your account.
    `      <a class="site-signin" href="/app/account" data-account-link hidden></a>`,
    `      ${connectCta("btn btn-primary btn-sm")}`,
    `    </header>`,
  ].join("\n");
}

export function siteFooter(): string {
  const links = FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("");
  return [
    `<footer class="site-foot">`,
    `      <p class="foot-edu">${EDUCATION_LINE}</p>`,
    `      <nav aria-label="Footer">${links}<a href="${SOURCE_URL}" target="_blank" rel="noreferrer">Source · Apache-2.0</a></nav>`,
    `      <p class="fine">© 2026 ATLAS Explain · <a href="/partners#how-its-built">How it's built</a></p>`,
    `    </footer>`,
  ].join("\n");
}

const HEADER_MARK = /<!--\s*site:header\s+([\w-]+)\s*-->/;
const FOOTER_MARK = /<!--\s*site:footer\s*-->/;

/** Fills a page's markers. Throws if a page lost its markers, so a page can't ship without them. */
export function applySiteFrame(html: string): string {
  const header = HEADER_MARK.exec(html);
  if (!header || !FOOTER_MARK.test(html)) throw new Error("Site page is missing <!-- site:header page --> or <!-- site:footer -->");
  const out = html
    .replace(HEADER_MARK, siteHeader(header[1] as SitePage))
    .replace(FOOTER_MARK, siteFooter());
  // The connector address, written once in src/core/links.ts and filled in wherever a page says %MCP_URL%.
  return out.replaceAll("%MCP_URL%", MCP_URL ?? "(not online yet)").replaceAll("%DATA_ORIGIN%", DATA_SITE_URL);
}
