import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { LEARN_PATH, learnTerms } from "../src/core/learn";
import { blankTitle, checkQuestions, dueTopics, nextReview, parseReview, passMark, recordCheck, REVIEW_DAYS, startReview } from "../src/core/review";
import { ALL_TERMS } from "../src/core/terms";
import { LEARNING_APP_HTML, LEARNING_APP_URI, LEARNING_STORE_KEY } from "../src/mcp/learning-app";
import { handle, learningCheckTool, learningHubTool, setFeatures, V2_TOOLS, visibleTools, type Fetcher } from "../src/mcp/server";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const DAY = 86_400_000;
const none: Fetcher = async () => new Response("no", { status: 404 });

describe("check-yourself questions, built only from the glossary", () => {
  it("asks up to three questions per topic, each with three different options and the right answer among them", () => {
    for (const step of LEARN_PATH) {
      const qs = checkQuestions(step.id, 42);
      expect(qs).toHaveLength(Math.min(3, learnTerms(step).length));
      for (const q of qs) {
        expect(q.options).toHaveLength(3);
        expect(new Set(q.options.map((o) => o.id)).size).toBe(3);
        expect(q.options.map((o) => o.id)).toContain(q.answerId);
        // Every option is a real glossary term, and the prompt is that term's own summary.
        for (const o of q.options) expect(ALL_TERMS.find((t) => t.id === o.id)?.title).toBe(o.title);
        expect(q.prompt).toBe(blankTitle(ALL_TERMS.find((t) => t.id === q.answerId)!));
      }
    }
  });

  it("blanks the term's own name, and gives the same questions for the same seed", () => {
    const inflation = ALL_TERMS.find((t) => t.id === "inflation")!;
    expect(blankTitle(inflation)).not.toMatch(/\binflation\b/i);
    expect(blankTitle(inflation)).toContain("___");
    // Plurals, a distinctive last word and an abbreviation would give the answer away, so they're blanked too.
    const blank = (id: string) => blankTitle(ALL_TERMS.find((t) => t.id === id)!);
    expect(blank("pip")).toContain("is 10 ___.");
    expect(blank("basis_point")).toContain("has risen 5 ___.");
    expect(blank("yield")).toContain("its ___ rises");
    expect(blank("implied_volatility")).toContain("High ___ means");
    // A generic last word ("rate", "market") isn't the answer on its own, so it stays.
    expect(blank("policy_rate")).toContain("The short-term rate a central bank sets");
    expect(blank("bull_market")).toContain("prices in a market");
    expect(checkQuestions("rates", 7)).toEqual(checkQuestions("rates", 7));
    expect(checkQuestions("nowhere", 7)).toEqual([]);
  });
});

describe("spaced review: 1, 7 and 28 days", () => {
  it("passes on two of three, moves a passed topic along, and restarts a missed review", () => {
    expect(REVIEW_DAYS).toEqual([1, 7, 28]);
    expect([passMark(3), passMark(2), passMark(1)]).toEqual([2, 2, 1]);
    let s = recordCheck({}, "rates", 1, 3, NOW);
    expect(s).toEqual({}); // a miss before the topic is started changes nothing
    s = recordCheck(s, "rates", 2, 3, NOW);
    expect(s.rates).toEqual({ stage: 0, due: new Date(NOW + DAY).toISOString() });
    s = recordCheck(s, "rates", 3, 3, NOW + DAY);
    expect(s.rates).toEqual({ stage: 1, due: new Date(NOW + 8 * DAY).toISOString() });
    s = recordCheck(s, "rates", 0, 3, NOW + 8 * DAY);
    expect(s.rates).toEqual({ stage: 0, due: new Date(NOW + 9 * DAY).toISOString() });
    s = recordCheck(recordCheck(recordCheck(s, "rates", 3, 3, NOW), "rates", 3, 3, NOW), "rates", 3, 3, NOW);
    expect(s.rates).toEqual({ stage: 3, due: null }); // kept
  });

  it("lists what's due in path order and the next one to come", () => {
    const s = { economy: { stage: 0, due: new Date(NOW - 1).toISOString() }, orders: { stage: 1, due: new Date(NOW - 5).toISOString() }, rates: { stage: 0, due: new Date(NOW + 3 * DAY).toISOString() } };
    expect(dueTopics(s, NOW).map((x) => x.id)).toEqual(["orders", "economy"]);
    expect(nextReview(s, NOW)?.step.id).toBe("rates");
    expect(startReview(s, "rates", NOW)).toBe(s);
    expect(startReview({}, "risk", NOW).risk).toEqual({ stage: 0, due: new Date(NOW + DAY).toISOString() });
  });

  it("reads back only known topics and well-formed entries", () => {
    expect(parseReview({ rates: { stage: 1, due: "2026-12-01T00:00:00.000Z" }, nope: { stage: 0, due: null }, risk: { stage: 9, due: null }, moves: { stage: 3, due: "x" } })).toEqual({ rates: { stage: 1, due: "2026-12-01T00:00:00.000Z" } });
    expect(parseReview("junk")).toEqual({});
    expect(parseReview(null)).toEqual({});
  });
});

describe("learning_hub and learning_check in the connector", () => {
  afterEach(() => setFeatures(undefined));

  it("are off until V2_TOOLS names them, and on in this deployment", async () => {
    setFeatures(undefined);
    const off = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "learning_hub", arguments: {} } }, none);
    expect(off?.error).toBeTruthy();
    expect(readFileSync("wrangler.toml", "utf8")).toMatch(/V2_TOOLS = "[^"]*learning_hub,learning_check/);
    setFeatures("learning_hub,learning_check");
    expect(visibleTools().map((t) => t.name)).toEqual(expect.arrayContaining(["learning_hub", "learning_check"]));
  });

  it("draws the hub view, and learning_check is for that view only", () => {
    const meta = (n: string) => (V2_TOOLS.find((t) => t.name === n) as { _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } })._meta?.ui;
    expect(meta("learning_hub")).toEqual({ resourceUri: LEARNING_APP_URI });
    expect(meta("learning_check")?.visibility).toEqual(["app"]);
  });

  it("answers with the whole path, or a topic to start on, and says what the schedule is", () => {
    const all = learningHubTool({});
    expect((all.structuredContent as { steps: unknown[] }).steps).toHaveLength(LEARN_PATH.length);
    expect(all.content[0]!.text).toContain("after 1, 7, 28 days");
    expect((learningHubTool({ topic: "rates" }).structuredContent as { topic: string }).topic).toBe("rates");
    expect(learningHubTool({ topic: "astrology" }).isError).toBe(true);
    const c = learningCheckTool({ topic: "saving", seed: 3 });
    expect((c.structuredContent as { questions: unknown[]; passMark: number }).questions).toHaveLength(3);
    expect((c.structuredContent as { passMark: number }).passMark).toBe(2);
    expect(learningCheckTool({ topic: "" }).isError).toBe(true);
  });

  it("serves the view, which keeps progress on the device and uses the same schedule", async () => {
    const r = await handle({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: LEARNING_APP_URI } }, none);
    expect((r?.result as { contents: { text: string }[] }).contents[0]!.text).toBe(LEARNING_APP_HTML);
    expect(LEARNING_APP_HTML).toContain("const DAYS = [1,7,28];");
    expect(LEARNING_APP_HTML).toContain(`const KEY = "${LEARNING_STORE_KEY}";`);
    expect(LEARNING_APP_HTML).toContain('callTool("learning_check"');
    expect(LEARNING_APP_HTML).toContain("Progress stays on this device");
    expect(LEARNING_APP_HTML).not.toMatch(/fetch\(/);
    // Claude's guidelines: honest about storage the host may clear.
    expect(LEARNING_APP_HTML).toContain("where your assistant may clear it");
  });

  it("is one compact card inline, with every topic in the side panel, and at most two actions after a check", () => {
    expect(LEARNING_APP_HTML).toContain('if (mode() !== "fullscreen" && canExpand) {');
    expect(LEARNING_APP_HTML).toContain('list.append(row(featured));');
    expect(LEARNING_APP_HTML).toContain('request("ui/request-display-mode", { mode: "fullscreen" })');
    expect(LEARNING_APP_HTML).not.toContain("Try different questions");
    const js = LEARNING_APP_HTML.split("<script>")[1]!.split("</script>")[0]!;
    expect(() => new Function(js)).not.toThrow();
  });
});

describe("Due for review in the web app", () => {
  it("shows the review card above the learn path, and keeps the schedule in this browser, the export and Clear data", () => {
    expect(readFileSync("src/wallet/learn-section.ts", "utf8")).toContain("slot.replaceChildren(...(due ? [due] : []), path);");
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain("storedReview: readReview(),");
    expect(app).toContain("reviewSchedule:");
    const data = readFileSync("src/core/account-data.ts", "utf8");
    expect(data).toContain('"atlas-explain-review",');
    expect(data).toContain("reviewSchedule: input.reviewSchedule ?? {},");
  });
});
