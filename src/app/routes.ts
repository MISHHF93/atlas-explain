/**
 * Route map for atlas-explain.web.app. Pure functions, no DOM, so they are unit tested.
 *
 * Public site (static HTML, no app JavaScript):  /  /how-it-works  /privacy  /terms  (404.html for the rest)
 * App (one lazy-loaded bundle, app.html):        /app  /app/explain  /app/assets  /app/assets/:symbol
 *                                                /app/learn  /app/account  /signin
 */

export type AppTab = "today" | "explain" | "assets" | "glossary" | "settings";

export type AppRoute =
  | { kind: "tab"; tab: AppTab }
  | { kind: "asset"; symbol: string }
  | { kind: "signin" }
  | { kind: "not_found"; path: string };

/** Path segment for each tab. "glossary" and "settings" keep their internal ids but read as Learn and Account. */
export const TAB_PATHS: Record<AppTab, string> = {
  today: "/app",
  explain: "/app/explain",
  assets: "/app/assets",
  glossary: "/app/learn",
  settings: "/app/account",
};

/** Old or alternative paths that land on a tab. */
const ALIASES: Record<string, AppTab> = {
  "/app/today": "today",
  "/app/digest": "today",
  "/app/home": "today",
  "/app/glossary": "glossary",
  "/app/settings": "settings",
  "/app/signal": "today",
};

const SYMBOL = /^[A-Za-z0-9.-]{1,15}$/;

export function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "").replace(/\/index\.html$/, "").replace(/\/app\.html$/, "/app");
  return trimmed === "" ? "/" : trimmed;
}

export function parseRoute(pathname: string): AppRoute {
  const path = normalisePath(pathname);
  if (path === "/signin") return { kind: "signin" };
  for (const [tab, p] of Object.entries(TAB_PATHS) as [AppTab, string][]) {
    if (path === p) return { kind: "tab", tab };
  }
  const alias = ALIASES[path];
  if (alias) return { kind: "tab", tab: alias };
  const asset = /^\/app\/assets\/([^/]+)$/.exec(path);
  if (asset) {
    let symbol: string;
    try {
      symbol = decodeURIComponent(asset[1] ?? "");
    } catch {
      symbol = "";
    }
    if (SYMBOL.test(symbol)) return { kind: "asset", symbol: symbol.toUpperCase() };
  }
  return { kind: "not_found", path };
}

export function pathFor(route: AppRoute): string {
  switch (route.kind) {
    case "tab":
      return TAB_PATHS[route.tab];
    case "asset":
      return `${TAB_PATHS.assets}/${encodeURIComponent(route.symbol)}`;
    case "signin":
      return "/signin";
    case "not_found":
      return route.path;
  }
}

/** The tab a route highlights in the navigation. */
export function tabFor(route: AppRoute): AppTab {
  if (route.kind === "tab") return route.tab;
  if (route.kind === "asset") return "assets";
  if (route.kind === "signin") return "settings";
  return "today";
}

export function titleFor(route: AppRoute): string {
  const names: Record<AppTab, string> = {
    today: "Today",
    explain: "Explain",
    assets: "Assets",
    glossary: "Learn",
    settings: "Account",
  };
  if (route.kind === "tab") return `${names[route.tab]} · ATLAS Explain`;
  if (route.kind === "asset") return `${route.symbol} · Assets · ATLAS Explain`;
  if (route.kind === "signin") return "Sign in · ATLAS Explain";
  return "Page not found · ATLAS Explain";
}

/** Query keys that belonged to the old single-page app at "/". */
const LEGACY_KEYS = ["tab", "demo", "sheet", "assets", "asset", "engine", "onboarding", "menu", "theme", "account", "signin", "apiKey", "oobCode", "mode"];
const LEGACY_TABS: Record<string, string> = {
  explain: TAB_PATHS.explain,
  assets: TAB_PATHS.assets,
  signal: TAB_PATHS.today,
  glossary: TAB_PATHS.glossary,
  settings: TAB_PATHS.settings,
};

/**
 * Links made before the site and app were split still work: ATLAS desk links (#c=...),
 * the extension sign-in link (?account=open), email sign-in links (?signin=email&oobCode=...)
 * and the preview flags (?tab=, ?demo=, ...). Returns where "/" should send the visitor, or null
 * to stay on the landing page.
 */
export function legacyRedirect(loc: { pathname: string; search: string; hash: string }): string | null {
  if (normalisePath(loc.pathname) !== "/") return null;
  const params = new URLSearchParams(loc.search);
  const hash = loc.hash ?? "";
  // Desk move links: #c=<base64url>, #card=<json>, #concept=<id>, in any order.
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const hasContext = ["c", "card", "concept"].some((key) => hashParams.has(key));
  const legacyHash = hash === "#/terms" ? "/terms" : hash === "#/privacy" ? "/privacy" : null;
  if (legacyHash) return legacyHash;
  const hasLegacyQuery = LEGACY_KEYS.some((key) => params.has(key));
  if (!hasContext && !hasLegacyQuery) return null;
  if (params.has("signin") || params.has("oobCode") || params.get("account") === "open") {
    if (params.get("account") === "open") params.delete("account");
    const q = params.toString();
    return `/signin${q ? `?${q}` : ""}${hash}`;
  }
  const tab = params.get("tab");
  const base = tab && LEGACY_TABS[tab] ? LEGACY_TABS[tab] : hasContext ? TAB_PATHS.explain : TAB_PATHS.today;
  const q = params.toString();
  return `${base}${q ? `?${q}` : ""}${hash}`;
}
