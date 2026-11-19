import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CaptureEnv } from "../src/data/capture";
import {
  boeDecisionItems, captureDocs, changesInContext, compareStatements, decisionWindow, ecbDecisionItems, extractBoeStatement, extractEcbStatement, parseBoeDecision, parseEcbDecision, diffWords, DOC_SOURCES, docsChanged, extractBocStatement, extractFedStatement,
  fracNumber, parseBocDecision, parseFedDecision, parseFeed, plain, readDocsFile, watchingSentences, type DocsFile,
} from "../src/data/docs";
import type { EconomyFile } from "../src/data/economy";
import { decisionExplainer, EDUCATION_LINE, handle, setFeatures, speechTracker, type Fetcher } from "../src/mcp/server";

// Real feeds and release pages saved from the Federal Reserve and the Bank of Canada on 18 Nov 2026.
const fx = (name: string) => readFileSync(`test/fixtures/docs/${name}`, "utf8");
const PAGES: Record<string, string> = {
  [DOC_SOURCES.fedMonetary]: "fed-monetary.xml",
  [DOC_SOURCES.fedSpeeches]: "fed-speeches.xml",
  [DOC_SOURCES.bocPress]: "boc-press.xml",
  [DOC_SOURCES.bocSpeeches]: "boc-speeches.xml",
  "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm": "fed-stmt-1028.html",
  "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm": "fed-stmt-0916.html",
  "https://www.bankofcanada.ca/2026/10/fad-press-release-2026-10-28/": "boc-stmt-1028.html",
  "https://www.bankofcanada.ca/2026/09/fad-press-release-2026-09-02/": "boc-stmt-0902.html",
  [DOC_SOURCES.ecbDecisions.replace("YEAR", "2026")]: "ecb-mopo-2026.html",
  [DOC_SOURCES.ecbPress]: "ecb-press.xml",
  [DOC_SOURCES.boeNews]: "boe-news.xml",
  [DOC_SOURCES.boeSpeeches]: "boe-speeches.xml",
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261029~9a493adf17.en.html": "ecb-mp-261029.html",
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html": "ecb-mp-260910.html",
  // No MPC meeting in October 2026: that address is a 404, as on the live site.
  "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/november-2026": "boe-november-2026.html",
  "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/september-2026": "boe-september-2026.html",
};
const NOW = Date.parse("2026-11-18T22:00:00Z");
function env(): CaptureEnv & { gets: string[] } {
  const gets: string[] = [];
  return {
    gets, now: NOW, sleep: async () => {}, log: () => {},
    get: async (url) => { gets.push(url); const f = PAGES[url]; if (!f) throw new Error(`404 ${url}`); return fx(f); },
  };
}
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("statements and speeches from the banks' own feeds", () => {
  it("reads both banks' feeds, with dates from pubDate or the link", () => {
    const fed = parseFeed(fx("fed-monetary.xml"));
    expect(fed.filter((i) => /issues FOMC statement/.test(i.title)).map((i) => i.date).slice(0, 2)).toEqual(["2026-10-28", "2026-09-16"]);
    const boc = parseFeed(fx("boc-press.xml")).filter((i) => /fad-press-release/.test(i.link));
    expect(boc.map((i) => i.date).slice(0, 2)).toEqual(["2026-10-28", "2026-09-02"]);
  });

  it("extracts each statement's text and reads the decision from it", () => {
    const fed = extractFedStatement(fx("fed-stmt-1028.html"));
    expect(fed[0]).toMatch(/approved the following statement for release by a 10 – 2 vote\.$/);
    expect(fed.some((p) => /^Voting against/.test(p))).toBe(true);
    expect(fed.join(" ")).not.toMatch(/media inquiries|Constitution Avenue/);
    expect(parseFedDecision(fed)).toEqual({ action: "hold", rate: 4, range: "3.75 to 4", bp: 0 });
    expect(parseFedDecision(extractFedStatement(fx("fed-stmt-0916.html")))).toEqual({ action: "raise", rate: 4, range: "3.75 to 4", bp: 25 });
    const boc = extractBocStatement(fx("boc-stmt-1028.html"));
    expect(boc[boc.length - 1]).toMatch(/^The next scheduled date for announcing/);
    expect(parseBocDecision(boc)).toEqual({ action: "raise", rate: 2.5, range: null, bp: 25 });
    expect(parseBocDecision(extractBocStatement(fx("boc-stmt-0902.html")))).toEqual({ action: "hold", rate: 2.25, range: null, bp: 0 });
    expect([fracNumber("3-3/4"), fracNumber("4"), fracNumber("2½"), fracNumber("1/4")]).toEqual([3.75, 4, 2.5, 0.25]);
  });

  it("compares the wording word by word, and finds what the bank says it is weighing", () => {
    const before = extractFedStatement(fx("fed-stmt-0916.html")).join(" "), after = extractFedStatement(fx("fed-stmt-1028.html")).join(" ");
    const parts = diffWords(before, after);
    // Putting the 'same' and 'added' runs back together gives the new text exactly; 'same' and 'removed' give the old.
    expect(parts.filter((p) => p.op !== "removed").map((p) => p.text).join(" ")).toBe(after.split(/\s+/).join(" "));
    expect(parts.filter((p) => p.op !== "added").map((p) => p.text).join(" ")).toBe(before.split(/\s+/).join(" "));
    const changes = changesInContext(parts);
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ removed: "raise", added: "maintain" }), expect.objectContaining({ removed: "solid", added: "strong" })]));
    expect(watchingSentences(extractFedStatement(fx("fed-stmt-1028.html")))[0]).toMatch(/^The accumulation of more information will help the Committee determine/);
    expect(watchingSentences(extractBocStatement(fx("boc-stmt-1028.html")))).toEqual(expect.arrayContaining([expect.stringMatching(/subject to considerable uncertainty/)]));
  });

  it("captures two statements and recent speeches per bank, and reads a statement page only once", async () => {
    const e = env();
    const docs = await captureDocs(e, null);
    expect(docs.statements.fed.map((s) => s.date)).toEqual(["2026-10-28", "2026-09-16"]);
    expect(docs.statements.boc.map((s) => [s.date, s.decision?.action])).toEqual([["2026-10-28", "raise"], ["2026-09-02", "hold"]]);
    expect(docs.speeches.fed[0]).toMatchObject({ date: "2026-11-18", speaker: "Barr", title: "Investing in America’s Underserved Communities" });
    expect(docs.speeches.boc.some((s) => s.speaker === "Deputy Governor Toni Gravelle")).toBe(true);
    expect(readDocsFile(JSON.parse(JSON.stringify(docs)))).toEqual(docs);
    const again = env();
    const next = await captureDocs(again, docs);
    expect(again.gets.filter((u) => /\.htm$|fad-press-release/.test(u))).toEqual([]);
    expect(docsChanged(docs, next)).toBe(false);
    // A failed feed keeps what was there.
    const down: CaptureEnv = { ...env(), get: async () => { throw new Error("down"); } };
    const kept = await captureDocs(down, docs);
    expect(kept.statements.fed.length).toBe(2);
    expect(kept.speeches.boc.length).toBe(docs.speeches.boc.length);
  });

  it("watches on decision days only: from a scheduled decision to three hours after", () => {
    const economy = { calendar: { capturedAt: "", events: [{ date: "2026-12-09", institution: "Federal Reserve", title: "FOMC", sourceUrl: "https://x" }, { date: "2026-12-17", institution: "European Central Bank", title: "ECB", sourceUrl: "https://x" }] } } as unknown as EconomyFile;
    // 2:00 pm New York on 9 Dec 2026 is 19:00 UTC.
    expect(decisionWindow(economy, Date.parse("2026-12-09T19:10:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-09T21:59:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-09T22:01:00Z"))).toBe(false);
    // Since phase 2b the ECB is watched too: 14:15 in Frankfurt is 13:15 UTC.
    expect(decisionWindow(economy, Date.parse("2026-12-17T13:30:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-18T13:30:00Z"))).toBe(false);
  });
});

describe("decision_explainer and speech_tracker", () => {
  let docs: DocsFile;
  const fetcher = (): Fetcher => async (url) => (url.endsWith("/docs.json") ? new Response(JSON.stringify(docs), { status: 200 }) : new Response("no", { status: 404 }));
  const text = (r: { content: { text: string }[] }) => r.content[0]!.text;

  it("explains the latest Fed decision from its statement, every claim with its source and date", async () => {
    docs = await captureDocs(env(), null);
    const r = await decisionExplainer("fed", undefined, fetcher(), NOW);
    const t = text(r);
    expect(t).toContain("On 2026-10-28 the Federal Reserve held its rate at a target range of 3.75% to 4%.");
    expect(t).toContain("Before that, on 2026-09-16 the Federal Reserve raised its rate by 25 basis points to a target range of 3.75% to 4%.");
    expect(t).toContain('removed "solid"; added "strong"');
    expect(t).toContain("What the statement says the bank is weighing");
    expect(t).not.toMatch(/\b(will (cut|raise|hold)|likely|expected to|you should|buy|sell)\b/i);
    expect(t.endsWith(EDUCATION_LINE)).toBe(true);
    const s = r.structuredContent as { watching: { source: { url: string }; asOf: string }[]; sources: { url: string; asOf: string }[] };
    for (const c of [...s.watching, ...s.sources]) {
      expect("source" in c ? c.source.url : c.url).toMatch(/^https:\/\//);
      expect(c.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("quotes the Bank of Canada briefly, with links, until its terms are confirmed", async () => {
    docs = await captureDocs(env(), null);
    const r = await decisionExplainer("Bank of Canada", "2026-10-28", fetcher(), NOW);
    expect(text(r)).toContain("On 2026-10-28 the Bank of Canada raised its rate by 25 basis points to 2.5%.");
    expect(text(r)).toContain("Quotes are shortened; the full text is at the link.");
    const s = r.structuredContent as { changes: { removed: string; added: string }[]; watching: { text: string }[] };
    for (const c of s.changes) expect(Math.max(words(c.removed), words(c.added))).toBeLessThanOrEqual(26);
    for (const w of s.watching) expect(words(w.text)).toBeLessThanOrEqual(41);
  });

  it("refuses what it can't answer, and says so", async () => {
    docs = await captureDocs(env(), null);
    expect((await decisionExplainer("boj", undefined, fetcher(), NOW)).isError).toBe(true);
    expect((await decisionExplainer("fed", "2025-01-01", fetcher(), NOW)).content[0]!.text).toContain("Only the last two");
    expect((await decisionExplainer("nope", undefined, fetcher(), NOW)).isError).toBe(true);
    expect((await decisionExplainer("fed", undefined, async () => new Response("down", { status: 503 }), NOW)).isError).toBe(true);
  });

  it("lists recent speeches with the bank's own description and a link", async () => {
    docs = await captureDocs(env(), null);
    const r = await speechTracker("fed", 7, fetcher(), NOW);
    const sp = (r.structuredContent as { speeches: { date: string; url: string; source: { url: string } }[] }).speeches;
    expect(sp.length).toBeGreaterThan(3);
    expect(sp.every((s) => s.date >= "2026-11-11" && s.source.url === s.url)).toBe(true);
    expect(text(r)).toContain("Federal Reserve's description:");
  });

  it("stays off until V2_TOOLS names it", async () => {
    setFeatures(undefined);
    const call = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "speech_tracker", arguments: { bank: "fed" } } }, fetcher());
    expect(call?.error?.code).toBe(-32602);
    setFeatures("decision_explainer,speech_tracker");
    try {
      const list = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, fetcher()))!.result as { tools: { name: string }[] };
      expect(list.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["decision_explainer", "speech_tracker"]));
    } finally {
      setFeatures(undefined);
    }
  });
});

describe("readable comparisons (found on live data, 18 Nov 2026)", () => {
  it("keeps punctuation tight where a link was removed, also in text stored before the fix", () => {
    expect(plain('the July <a href="/mpr">Monetary Policy Report</a>, global activity (<em>GDP</em>) rose 3%.')).toBe("the July Monetary Policy Report, global activity (GDP) rose 3%.");
    const stored = { schema: "atlas-explain-docs-v1", generatedAt: "2026-11-18T22:00:00.000Z", statements: { fed: [], boc: [{ bank: "boc", date: "2026-10-28", title: "t", url: "https://x.ca/a", paragraphs: ["the July Monetary Policy Report , global"], decision: null, capturedAt: "x" }] }, speeches: { fed: [], boc: [] } };
    expect(readDocsFile(stored)!.statements.boc[0]!.paragraphs[0]).toBe("the July Monetary Policy Report, global");
  });

  it("compares an edited statement word by word, and a rewritten one sentence by sentence", () => {
    const fed = compareStatements(extractFedStatement(fx("fed-stmt-0916.html")), extractFedStatement(fx("fed-stmt-1028.html")));
    expect(fed.mode).toBe("words");
    expect(fed.changes.length).toBe(10);
    const boc = compareStatements(extractBocStatement(fx("boc-stmt-0902.html")), extractBocStatement(fx("boc-stmt-1028.html")));
    expect(boc.mode).toBe("sentences");
    expect(boc.changedShare).toBeGreaterThan(0.5);
    expect(boc.newSentences[0]).toMatch(/^The Bank of Canada today increased its target/);
    expect(boc.droppedCount).toBeGreaterThan(10);
  });

  it("says plainly when a statement was mostly rewritten, with short quotes of its new sentences", async () => {
    const docs = await captureDocs(env(), null);
    const r = await decisionExplainer("boc", undefined, async (url) => (url.endsWith("/docs.json") ? new Response(JSON.stringify(docs)) : new Response("no", { status: 404 })), NOW);
    const t = r.content[0]!.text;
    expect(t).toMatch(/Most of the statement was rewritten since 2026-09-02: about \d+% of its words changed/);
    expect(t).not.toContain("How the statement's wording changed");
    const s = r.structuredContent as { comparison: { mode: string }; newSentences: string[] };
    expect(s.comparison.mode).toBe("sentences");
    expect(s.newSentences.length).toBeLessThanOrEqual(6);
    for (const x of s.newSentences) expect(words(x)).toBeLessThanOrEqual(26);
  });
});

describe("the ECB and the Bank of England (phase 2b)", () => {
  it("finds each bank's decision statements: the ECB from its decisions list, the Bank of England from its feed and the months before", () => {
    expect(ecbDecisionItems(fx("ecb-mopo-2026.html")).slice(0, 2).map((i) => i.date)).toEqual(["2026-10-29", "2026-09-10"]);
    const boe = boeDecisionItems(fx("boe-news.xml"));
    expect(boe[0]).toMatchObject({ date: "2026-11-05", link: "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/november-2026" });
    expect(boe.slice(1, 3).map((i) => i.link.split("/").pop())).toEqual(["october-2026", "september-2026"]);
  });

  it("reads each decision from the statement, the Committee's own vote and not a dissent's", () => {
    expect(parseEcbDecision(extractEcbStatement(fx("ecb-mp-261029.html")))).toEqual({ action: "hold", rate: 2.5, range: null, bp: 0 });
    expect(parseEcbDecision(extractEcbStatement(fx("ecb-mp-260910.html")))).toEqual({ action: "raise", rate: 2.5, range: null, bp: 25 });
    expect(parseBoeDecision(extractBoeStatement(fx("boe-november-2026.html")))).toEqual({ action: "raise", rate: 4, range: null, bp: 25 });
    // September: "voted by a majority of 6–3 to maintain Bank Rate at 3.75%. Three members voted to increase … to 4%."
    expect(parseBoeDecision(extractBoeStatement(fx("boe-september-2026.html")))).toEqual({ action: "hold", rate: 3.75, range: null, bp: 0 });
    // The summary only, never the minutes on the same page.
    expect(extractBoeStatement(fx("boe-november-2026.html")).join(" ")).not.toContain("Before turning to its immediate policy decision");
    expect(extractEcbStatement(fx("ecb-mp-261029.html")).join(" ")).not.toMatch(/press conference starting|Reproduction is permitted/);
  });

  it("captures two statements and recent speeches for all four banks", async () => {
    const docs = await captureDocs(env(), null);
    expect(docs.statements.ecb.map((s) => [s.date, s.decision?.action])).toEqual([["2026-10-29", "hold"], ["2026-09-10", "raise"]]);
    expect(docs.statements.boe.map((s) => [s.date, s.decision?.action, s.decision?.rate])).toEqual([["2026-11-05", "raise", 4], ["2026-09-17", "hold", 3.75]]);
    expect(docs.speeches.ecb[0]).toMatchObject({ speaker: "Boris Vujčić", date: "2026-11-18" });
    expect(docs.speeches.ecb.every((x) => !x.url.includes("europa.eu//"))).toBe(true);
    expect(docs.speeches.boe[0]).toMatchObject({ speaker: "Andrew Bailey", date: "2026-11-18" });
    // Nothing new on the next run: no statement page is read again, and no month is probed.
    const again = env();
    await captureDocs(again, docs);
    expect(again.gets.filter((u) => /ecb\.mp|monetary-policy-summary-and-minutes|\.htm$|fad-press-release/.test(u))).toEqual([]);
  });

  it("explains ECB and Bank of England decisions; quotes the ECB with credit and keeps Bank of England quotes short", async () => {
    const docs = await captureDocs(env(), null);
    const fetcher: Fetcher = async (url) => (url.endsWith("/docs.json") ? new Response(JSON.stringify(docs)) : new Response("no", { status: 404 }));
    const ecb = await decisionExplainer("ecb", undefined, fetcher, NOW);
    expect(ecb.content[0]!.text).toContain("On 2026-10-29 the European Central Bank held its deposit facility rate at 2.5%.");
    expect(ecb.content[0]!.text).toContain("Reproduced with the European Central Bank as the source.");
    const boe = await decisionExplainer("Bank of England", undefined, fetcher, NOW);
    expect(boe.content[0]!.text).toContain("On 2026-11-05 the Bank of England raised Bank Rate by 25 basis points to 4%. Before that, on 2026-09-17 the Bank of England held Bank Rate at 3.75%.");
    expect(boe.content[0]!.text).toContain("Quotes are shortened; the full text is at the link.");
    // Our own wording never predicts; the banks' own words (the ECB writes "likely to drive up inflation") appear
    // only inside quotation marks, attributed, as docs/V2_DESIGN.md allows.
    for (const t of [ecb, boe].map((r) => r.content[0]!.text.replace(/"[^"]*"/g, '""'))) expect(t).not.toMatch(/\b(will (cut|raise|hold)|likely to|you should|buy|sell)\b/i);
    const sp = await speechTracker("boe", 30, fetcher, NOW);
    expect(sp.content[0]!.text).toContain("Andrew Bailey");
  });

  it("watches all four banks' decision days", () => {
    const economy = { calendar: { capturedAt: "", events: [{ date: "2026-12-17", institution: "European Central Bank", title: "ECB", sourceUrl: "https://x" }, { date: "2026-12-17", institution: "Bank of England", title: "MPC", sourceUrl: "https://x" }] } } as unknown as EconomyFile;
    // ECB 14:15 Frankfurt is 13:15 UTC; Bank of England 12:00 London is 12:00 UTC.
    expect(decisionWindow(economy, Date.parse("2026-12-17T12:05:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-17T16:30:00Z"))).toBe(false);
  });
});
