/**
 * The output catalog at GET /api/v1/catalog: one public JSON object saying what an organization can get from
 * ATLAS Explain (every connector tool with its input and output JSON Schema, every REST endpoint, every data
 * series) and what it may do with each. Built from the code and the published data, so it can't drift; a tool
 * without a reuse class fails test/output-catalog.test.ts. Nothing here is legal advice (docs/PARTNER_API.md).
 */
import { EDUCATION_LINE, SERVER_VERSION, visibleTools } from "./server";
import { EXPLAIN_WEB_URL, MCP_ORIGIN } from "../core/links";

export const CATALOG_SCHEMA = "atlas-explain-output-catalog-v1";

export const REUSE = {
  own_content: "ATLAS Explain's own content: explanations, warning-sign checks and arithmetic. Under the partner terms; credit ATLAS Explain.",
  official_with_credit: "Official figures, each naming its source: show the source with the figure. Figures from the ECB, the Bank of Canada, the Bank of England and the New York Fed: each bank's terms are to be confirmed before paid use.",
  terms_to_confirm: "Central banks' own statements and speeches, quoted briefly with links. The Bank of Canada's and the Bank of England's terms are to be confirmed before paid use.",
  titles_and_links: "Titles and links only; the publishers own the articles.",
  not_offered: "Not offered to partners: crypto prices come from sources that don't allow redistribution without a paid licence.",
} as const;
export type Reuse = keyof typeof REUSE;

/** What a partner may do with each tool's answer. Every tool must be here. */
export const TOOL_REUSE: Readonly<Record<string, Reuse>> = {
  explain_term: "own_content", browse_glossary: "own_content", learning_hub: "own_content", learning_check: "own_content",
  scam_red_flags: "own_content", money_maths: "own_content", debt_payoff: "own_content",
  asset_details: "official_with_credit", official_figures: "official_with_credit", economy_snapshot: "official_with_credit",
  economic_calendar: "official_with_credit", evidence_brief: "official_with_credit", notable_today: "official_with_credit",
  upcoming_events: "official_with_credit", treasury_auctions: "official_with_credit", compare_countries: "official_with_credit",
  data_series: "official_with_credit", whats_changed: "official_with_credit", inflation_calculator: "official_with_credit",
  rate_change_impact: "official_with_credit",
  decision_explainer: "terms_to_confirm", speech_tracker: "terms_to_confirm",
  todays_headlines: "titles_and_links",
  crypto_prices: "not_offered", price_history: "not_offered", market_depth: "not_offered",
};

/** Tools that also answer about coins; for a partner they leave the coins out. */
export const NO_COINS: ReadonlySet<string> = new Set(["asset_details", "evidence_brief", "notable_today"]);

/** Central banks whose reuse terms are to be confirmed before paid use (docs/PARTNER_API.md). */
const TO_CONFIRM = /^(European Central Bank|Bank of Canada|Bank of England|Federal Reserve Bank of New York)\b/;
const CONFIRM_NOTE = "To be confirmed with the bank before paid use.";

interface Endpoint { method: string; path: string; what: string }
interface SeriesRow { id: string; name: string; unit: string; points: number; source: string; licence: string }

export function outputCatalog(o: { endpoints: readonly Endpoint[]; credit: Record<string, string[]>; hidden: ReadonlySet<string>; series: SeriesRow[] | null; now: number }) {
  type Tool = ReturnType<typeof visibleTools>[number] & { outputSchema?: unknown; _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } };
  const all = visibleTools() as Tool[];
  // Tools only a view calls are plumbing, not something to build on.
  const usable = all.filter((t) => !t._meta?.ui?.visibility?.every((v) => v === "app"));
  const offered = usable.filter((t) => !o.hidden.has(t.name));
  const nameOf = (path: string) => /^\/api\/v1\/([a-z-]+)/.exec(path)?.[1] ?? "";
  return {
    schema: CATALOG_SCHEMA,
    connectorVersion: SERVER_VERSION,
    generatedAt: new Date(o.now).toISOString(),
    educationOnly: true,
    notice: EDUCATION_LINE,
    status: "Sandbox: free and rate-limited, keys issued by hand. Not yet for production use or for sale; the partner terms are a draft awaiting legal review.",
    access: {
      mcp: { url: `${MCP_ORIGIN}/mcp`, auth: "Authorization: Bearer atlx_… (partner key)" },
      rest: { url: `${MCP_ORIGIN}/api/v1`, auth: "Authorization: Bearer atlx_… (partner key)" },
      openapi: `${EXPLAIN_WEB_URL}/partners/openapi.json`,
      askForAKey: `${EXPLAIN_WEB_URL}/partners#key`,
    },
    counts: { mcpTools: offered.length, restEndpoints: o.endpoints.length, series: o.series?.length ?? null, seriesPoints: o.series?.reduce((n, s) => n + s.points, 0) ?? null },
    reuse: REUSE,
    tools: offered.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      reuse: TOOL_REUSE[t.name] ?? null,
      ...(NO_COINS.has(t.name) ? { note: "Coins are left out of partner answers." } : {}),
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema ?? null,
      view: t._meta?.ui?.resourceUri ?? null,
    })),
    rest: o.endpoints.map((e) => ({ method: e.method, path: e.path, returns: e.what, credit: o.credit[nameOf(e.path)] ?? [] })),
    // null when the published data couldn't be read: nothing is shown in its place.
    series: o.series?.map((s) => (TO_CONFIRM.test(s.source) ? { ...s, licence: `${s.licence} ${CONFIRM_NOTE}` } : s)) ?? null,
    notOffered: usable.filter((t) => o.hidden.has(t.name)).map((t) => ({ name: t.name, why: REUSE.not_offered })),
  };
}
