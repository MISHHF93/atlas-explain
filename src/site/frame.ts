/**
 * The one header and footer of the public site pages (/, /connect, /support, /privacy, /terms,
 * /how-its-built, 404). Each page holds only `<!-- site:header -->` and `<!-- site:footer -->`
 * markers; the build (vite.config.ts) and the tests (applySiteFrame) put this markup in, so the
 * pages can never drift apart again.
 *
 * One way in: the website's only button into the product is "Get started" (/start). It passes the
 * Sign in page (signing in is required for the web app), then Get started offers the two ways in:
 * the AI-assistant connector (/connect, public setup steps, no account) and the web app (/app).
 * Signed in on this browser, the button reads "Open ATLAS Explain" and your initials link to your
 * account (src/site/site.ts). There is no separate "Sign in" or "The app" link: they led to the
 * same place.
 */
import { DATA_SITE_URL, EDUCATION_LINE, MCP_URL } from "../core/links";

export type SitePage = "home" | "connect" | "support" | "privacy" | "terms" | "how-its-built" | "404";

const SOURCE_URL = "https://github.com/MISHHF93/atlas-explain";

const NAV: readonly { href: string; label: string; page?: SitePage }[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/connect", label: "AI assistants", page: "connect" },
  { href: "/support", label: "Support", page: "support" },
];

/** Every public destination, once. */
const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/start", label: "Get started" },
  { href: "/connect", label: "Add to your AI assistant" },
  { href: "/support", label: "Support and FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/** The one way into the product: Get started (Sign in, then the connector or the web app). */
export function startCta(className: string): string {
  return `<a class="${className}" href="/start" data-start-cta>Get started</a>`;
}

/** Straight to the connector's setup steps, for people who already know they want it. */
export function connectCta(className: string): string {
  return `<a class="${className}" href="/connect">Add to your AI assistant</a>`;
}


export function siteHeader(page: SitePage): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.page === page ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return [
    `<header class="site-head">`,
    `      <a class="brand" href="/" aria-label="ATLAS Explain home"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>ATLAS</b> Explain</span></a>`,
    `      <nav class="site-nav" aria-label="Site">${nav}</nav>`,
    // Signed in on this browser: site.ts shows your initials here, linking to your account.
    `      <a class="site-signin" href="/app/account" data-account-link hidden></a>`,
    `      ${startCta("btn btn-primary btn-sm")}`,
    `    </header>`,
  ].join("\n");
}

export function siteFooter(): string {
  const links = FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("");
  return [
    `<footer class="site-foot">`,
    `      <p class="foot-edu">${EDUCATION_LINE}</p>`,
    `      <nav aria-label="Footer">${links}<a href="${SOURCE_URL}" target="_blank" rel="noreferrer">Source · Apache-2.0</a></nav>`,
    `      <p class="fine">© 2026 ATLAS Explain · <a href="/how-its-built">How it's built</a></p>`,
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
