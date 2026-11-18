import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CaptureEnv } from "../src/data/capture";
import {
  captureDocs, changesInContext, decisionWindow, diffWords, DOC_SOURCES, docsChanged, extractBocStatement, extractFedStatement,
  fracNumber, parseBocDecision, parseFedDecision, parseFeed, readDocsFile, watchingSentences, type DocsFile,
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

  it("watches on decision days only: from a scheduled Fed or Bank of Canada decision to three hours after", () => {
    const economy = { calendar: { capturedAt: "", events: [{ date: "2026-12-09", institution: "Federal Reserve", title: "FOMC", sourceUrl: "https://x" }, { date: "2026-12-17", institution: "European Central Bank", title: "ECB", sourceUrl: "https://x" }] } } as unknown as EconomyFile;
    // 2:00 pm New York on 9 Dec 2026 is 19:00 UTC.
    expect(decisionWindow(economy, Date.parse("2026-12-09T19:10:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-09T21:59:00Z"))).toBe(true);
    expect(decisionWindow(economy, Date.parse("2026-12-09T22:01:00Z"))).toBe(false);
    expect(decisionWindow(economy, Date.parse("2026-12-17T13:30:00Z"))).toBe(false);
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
    expect((await decisionExplainer("ecb", undefined, fetcher(), NOW)).isError).toBe(true);
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
