import { describe, expect, it } from "vitest";
import { MAX_TEXT_HISTORY, addTextHistory, ageLabel, readTextHistory, removeTextHistory, type TextHistoryEntry } from "../src/core/text-history";

const entry = (id: string, text: string, at = 0): TextHistoryEntry => ({ id, text, answer: null, plain: "p", source: "in_cloud", at });

describe("text history", () => {
  it("keeps newest first, drops repeats of the same text and caps the list", () => {
    let list: TextHistoryEntry[] = [];
    for (let i = 0; i < MAX_TEXT_HISTORY + 5; i++) list = addTextHistory(list, entry(String(i), `term ${i}`));
    expect(list).toHaveLength(MAX_TEXT_HISTORY);
    expect(list[0]?.id).toBe(String(MAX_TEXT_HISTORY + 4));
    list = addTextHistory(list, entry("again", "TERM 10"));
    expect(list.filter((e) => e.text.toLowerCase() === "term 10")).toHaveLength(1);
    expect(list[0]?.id).toBe("again");
    expect(removeTextHistory(list, "again").some((e) => e.id === "again")).toBe(false);
  });
  it("reads stored history leniently", () => {
    expect(readTextHistory(null)).toEqual([]);
    expect(readTextHistory("not json")).toEqual([]);
    expect(readTextHistory(JSON.stringify([entry("a", "x"), { id: 1 }]))).toHaveLength(1);
  });
  it("labels ages", () => {
    expect(ageLabel(0, 10_000)).toBe("just now");
    expect(ageLabel(0, 5 * 60_000)).toBe("5 min ago");
    expect(ageLabel(0, 3 * 3_600_000)).toBe("3 h ago");
  });
});
