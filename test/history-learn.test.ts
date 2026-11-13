import { describe, expect, it } from "vitest";
import { HISTORY_MAX, addToHistory, makeEntry, parseHistory, relativeTime } from "../src/core/history";
import { LEARN_PATH, learnProgress, learnTerms, parseLearned } from "../src/core/learn";
import { ALL_TERMS } from "../src/core/terms";

describe("on-device history", () => {
  it("keeps newest first, one entry per highlight, capped", () => {
    let list = [] as ReturnType<typeof parseHistory>;
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) {
      list = addToHistory(list, makeEntry({ selection: `term ${i}`, text: "x", source: "on_device", at: i }));
    }
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0]?.selection).toBe(`term ${HISTORY_MAX + 4}`);
    list = addToHistory(list, makeEntry({ selection: "TERM 10", text: "again", source: "in_cloud", at: 99 }));
    expect(list.filter((e) => e.selection.toLowerCase() === "term 10")).toHaveLength(1);
  });

  it("redacts account-like numbers before storing", () => {
    const entry = makeEntry({ selection: "Account number 12345678 balance: $9,000", text: "t", source: "on_device" });
    expect(entry.selection).not.toMatch(/12345678|9,000/);
  });

  it("drops malformed stored entries", () => {
    const good = makeEntry({ selection: "RSI", text: "t", source: "in_cloud", at: 5 });
    expect(parseHistory([good, { id: 1 }, null, { ...good, source: "server" }])).toEqual([good]);
    expect(parseHistory("nope")).toEqual([]);
  });

  it("formats relative times", () => {
    expect(relativeTime(0, 30_000)).toBe("just now");
    expect(relativeTime(0, 5 * 60_000)).toBe("5 min ago");
    expect(relativeTime(0, 3 * 3_600_000)).toBe("3 h ago");
  });
});

describe("learn path", () => {
  it("covers every glossary term exactly once", () => {
    const ids = LEARN_PATH.flatMap((step) => step.terms);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ALL_TERMS.map((t) => t.id).sort());
    for (const step of LEARN_PATH) expect(learnTerms(step)).toHaveLength(step.terms.length);
  });

  it("tracks progress and the next lesson", () => {
    const none = learnProgress(new Set());
    expect(none.done).toBe(0);
    expect(none.next?.term.id).toBe("market_order");
    const all = learnProgress(parseLearned(ALL_TERMS.map((t) => t.id)));
    expect(all.done).toBe(all.total);
    expect(all.next).toBeNull();
    expect(parseLearned(["margin", "bogus", 3])).toEqual(new Set(["margin"]));
  });
});
