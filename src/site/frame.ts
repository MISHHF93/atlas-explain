/**
 * The one header and footer of the public site pages (/, /connect, /support, /privacy, /terms,
 * /welcome, /how-its-built, 404). Each page holds only `<!-- site:header -->` and `<!-- site:footer -->`
 * markers; the build (vite.config.ts) and the tests (applySiteFrame) put this markup in, so the
 * pages can never drift apart again.
 *
 * Install wording is honest: until the Chrome Web Store listing exists (CHROME_STORE_URL in
 * src/core/links.ts), every primary button opens the web app; setting the listing turns them all
 * into "Add to Chrome" at the next build.
 */
import { CHROME_STORE_URL, EDUCATION_LINE, MCP_URL } from "../core/links";

export type SitePage = "home" | "connect" | "support" | "privacy" | "terms" | "welcome" | "how-its-built" | "404";

const SOURCE_URL = "https://github.com/MISHHF93/atlas-explain";

const NAV: readonly { href: string; label: string; page?: SitePage }[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/app", label: "Web app" },
  { href: "/connect", label: "AI assistants", page: "connect" },
  { href: "/support", label: "Support", page: "support" },
];

/** Every public destination, once. */
const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/#install", label: "Chrome extension" },
  { href: "/app", label: "Web app" },
  { href: "/welcome#step-try", label: "Practice page" },
  { href: "/connect", label: "AI assistants" },
  { href: "/support", label: "Support and FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/** The primary call to action: the store when listed, the web app until then. */
export function installCta(className: string): string {
  return CHROME_STORE_URL
    ? `<a class="${className}" href="${CHROME_STORE_URL}" target="_blank" rel="noreferrer">Add to Chrome</a>`
    : `<a class="${className}" href="/app">Open the web app</a>`;
}

export function siteHeader(page: SitePage): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.page === page ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return [
    `<header class="site-head">`,
    `      <a class="brand" href="/" aria-label="ATLAS Explain home"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>ATLAS</b> Explain</span></a>`,
    `      <nav class="site-nav" aria-label="Site">${nav}</nav>`,
    // Signed out: "Sign in". site.ts turns it into your initials and "Account" when the app says you're signed in.
    `      <a class="site-signin" href="/signin" data-account-link>Sign in</a>`,
    `      ${installCta("btn btn-primary btn-sm")}`,
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
const CTA_MARK = /<!--\s*site:cta\s+"([^"]+)"\s*-->/g;

/**
 * Shows the "live" block and hides the "not yet" block when the store listing is set, and puts the
 * address into its links (`data-store-link`). Done at build time, so the page never flashes the
 * wrong state and needs no script for it.
 */
function switchOn(html: string, name: "store", url: string | null, fill: (html: string, url: string) => string): string {
  if (!url) return html;
  return fill(html.replaceAll(`data-before-${name}>`, `data-before-${name} hidden>`).replaceAll(`data-when-${name} hidden>`, `data-when-${name}>`), url);
}

/** Fills a page's markers. Throws if a page lost its markers, so a page can't ship without them. */
export function applySiteFrame(html: string): string {
  const header = HEADER_MARK.exec(html);
  if (!header || !FOOTER_MARK.test(html)) throw new Error("Site page is missing <!-- site:header page --> or <!-- site:footer -->");
  let out = html
    .replace(HEADER_MARK, siteHeader(header[1] as SitePage))
    .replace(FOOTER_MARK, siteFooter())
    .replace(CTA_MARK, (_m, cls: string) => installCta(cls));
  out = switchOn(out, "store", CHROME_STORE_URL, (h, url) => h.replaceAll(`data-store-link href="/#install"`, `data-store-link href="${url}"`));
  // The connector address, written once in src/core/links.ts and filled in wherever a page says %MCP_URL%.
  return out.replaceAll("%MCP_URL%", MCP_URL ?? "(not online yet)");
}
