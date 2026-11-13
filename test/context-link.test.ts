import { describe, expect, it } from "vitest";
import {
  buildExplainUrl,
  parseContextHash,
  parseExplainContext,
  serializeContextHash,
  stripForbidden,
} from "../src/core/context-link";

const publicCard = {
  symbol: "BTCUSDT",
  asOf: "2026-11-12",
  movePct: -6.2,
  volumeVsNormal: 1.8,
  marketLabel: "Kraken crypto",
  marketMovePct: -2.1,
  sourceNote: "Public session figures from the ATLAS Markets desk. Educational use only.",
};

describe("stripForbidden", () => {
  it("removes notes, watchlist, balances, and account fields but keeps sourceNote", () => {
    const strippedPaths: string[] = [];
    const cleaned = stripForbidden(
      {
        ...publicCard,
        notes: "do not send",
        watchlist: ["ETH"],
        balance: 12000,
        account: { accountId: "acc-1", buyingPower: 4000 },
        sourceNote: publicCard.sourceNote,
      },
      "$",
      strippedPaths,
    ) as Record<string, unknown>;
    expect(cleaned.notes).toBeUndefined();
    expect(cleaned.watchlist).toBeUndefined();
    expect(cleaned.balance).toBeUndefined();
    expect(cleaned.account).toBeUndefined();
    expect(cleaned.sourceNote).toBe(publicCard.sourceNote);
    expect(cleaned.symbol).toBe("BTCUSDT");
    expect(strippedPaths).toEqual(expect.arrayContaining(["notes", "watchlist", "balance", "account"]));
  });
});

describe("parseExplainContext", () => {
  it("accepts a versioned envelope and a bare public card", () => {
    const envelope = parseExplainContext({
      v: 1,
      kind: "move_card",
      source: "atlas_desk",
      card: publicCard,
      question: "Why might some traders buy this dip while others sell?",
      concepts: ["shadow", "not_a_real_concept"],
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;
    expect(envelope.value.context?.card.symbol).toBe("BTCUSDT");
    expect(envelope.value.context?.card.notes).toBeUndefined();
    expect(envelope.value.context?.concepts).toEqual(["shadow"]);
    expect(envelope.value.warnings.some((item) => item.includes("not_a_real_concept"))).toBe(true);

    const bare = parseExplainContext(publicCard);
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    expect(bare.value.context?.source).toBe("deep_link");
    expect(bare.value.context?.card.movePct).toBe(-6.2);
  });

  it("strips private fields from an inbound card and does not keep them on the context", () => {
    const result = parseExplainContext({
      v: 1,
      kind: "move_card",
      card: { ...publicCard, notes: "secret desk note", watchlist: ["ETHUSDT"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context?.card.notes).toBeUndefined();
    expect(result.value.context?.card.watchlist).toEqual([]);
    expect(result.value.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseContextHash and serializeContextHash", () => {
  it("round-trips a public envelope on #c= and loads #concept= without a card", () => {
    const built = parseExplainContext({ v: 1, kind: "move_card", card: publicCard, concepts: ["paper_only"] });
    expect(built.ok).toBe(true);
    if (!built.ok || !built.value.context) return;
    const hash = serializeContextHash(built.value.context);
    expect(hash.startsWith("#c=")).toBe(true);
    const parsed = parseContextHash(hash);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.context?.card.symbol).toBe("BTCUSDT");
    expect(parsed.value.context?.card.notes).toBeUndefined();

    const conceptOnly = parseContextHash("#concept=drop_study");
    expect(conceptOnly.ok).toBe(true);
    if (!conceptOnly.ok) return;
    expect(conceptOnly.value.conceptId).toBe("drop_study");
    expect(conceptOnly.value.context).toBeUndefined();
  });

  it("accepts a URI-encoded #card= payload", () => {
    const encoded = encodeURIComponent(JSON.stringify(publicCard));
    const parsed = parseContextHash(`#card=${encoded}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.context?.card.movePct).toBe(-6.2);
  });

  it("builds a hosted URL and rejects a huge hash", () => {
    const built = parseExplainContext({ v: 1, kind: "move_card", card: publicCard });
    expect(built.ok).toBe(true);
    if (!built.ok || !built.value.context) return;
    const url = buildExplainUrl("https://atlas-explain.web.app", built.value.context, "live_lock");
    expect(url.startsWith("https://atlas-explain.web.app/#c=")).toBe(true);
    expect(url.includes("concept=live_lock")).toBe(true);

    const huge = `#c=${"A".repeat(20_000)}`;
    const rejected = parseContextHash(huge);
    expect(rejected.ok).toBe(false);
  });
});
