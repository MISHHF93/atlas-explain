/**
 * The one header and footer of the public site pages (/, /connect, /support, /privacy, /terms,
 * /how-its-built, 404). Each page holds only `<!-- site:header -->` and `<!-- site:footer -->`
 * markers; the build (vite.config.ts) and the tests (applySiteFrame) put this markup in, so the
 * pages can never drift apart again.
 *
 * The journey: the website first, then Sign in (once per browser, or skipped when signed in), then
 * Get started (/start), which offers the two ways in: the AI-assistant connector (/connect, public
 * setup steps) and the web app (/app). The header's main button is "Get started"; "The app" in the
 * navigation goes straight to the app (through Sign in once), for people who already know.
 */
import { EDUCATION_LINE, MCP_URL } from "../core/links";

export type SitePage = "home" | "connect" | "support" | "privacy" | "terms" | "how-its-built" | "404";

const SOURCE_URL = "https://github.com/MISHHF93/atlas-explain";

const NAV: readonly { href: string; label: string; page?: SitePage }[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/connect", label: "AI assistants", page: "connect" },
  { href: "/app", label: "The app" },
  { href: "/support", label: "Support", page: "support" },
];

/** Every public destination, once. */
const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/start", label: "Get started" },
  { href: "/connect", label: "Add to your AI assistant" },
  { href: "/app", label: "The app" },
  { href: "/support", label: "Support and FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/** The site-wide call to action: the start of the journey (Sign in, then choose a way in). */
export function startCta(className: string): string {
  return `<a class="${className}" href="/start">Get started</a>`;
}

/** Straight to the connector's setup steps, for people who already know they want it. */
export function connectCta(className: string): string {
  return `<a class="${className}" href="/connect">Add to your AI assistant</a>`;
}

/** The web app's call to action. */
export function appCta(className: string): string {
  return `<a class="${className}" href="/app">Open the app</a>`;
}

export function siteHeader(page: SitePage): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.page === page ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return [
    `<header class="site-head">`,
    `      <a class="brand" href="/" aria-label="ATLAS Explain home"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>ATLAS</b> Explain</span></a>`,
    `      <nav class="site-nav" aria-label="Site">${nav}</nav>`,
    // Signed out: "Sign in". site.ts turns it into your initials and "Account" when the app says you're signed in.
    `      <a class="site-signin" href="/signin" data-account-link>Sign in</a>`,
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
const CTA_MARK = /<!--\s*site:cta\s+"([^"]+)"\s*-->/g;

/** Fills a page's markers. Throws if a page lost its markers, so a page can't ship without them. */
export function applySiteFrame(html: string): string {
  const header = HEADER_MARK.exec(html);
  if (!header || !FOOTER_MARK.test(html)) throw new Error("Site page is missing <!-- site:header page --> or <!-- site:footer -->");
  const out = html
    .replace(HEADER_MARK, siteHeader(header[1] as SitePage))
    .replace(FOOTER_MARK, siteFooter())
    .replace(CTA_MARK, (_m, cls: string) => appCta(cls));
  // The connector address, written once in src/core/links.ts and filled in wherever a page says %MCP_URL%.
  return out.replaceAll("%MCP_URL%", MCP_URL ?? "(not online yet)");
}
