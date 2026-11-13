import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  EXPLAIN_ERROR_MESSAGE,
  EXPLAIN_LOAD_MESSAGE,
  EXPLAIN_LOADED_MESSAGE,
  inboundReply,
  isAllowedOrigin,
  readInboundMessage,
} from "../src/core/inbound";

const payload = {
  v: 1,
  kind: "move_card",
  source: "atlas_desk",
  card: { symbol: "ETHUSDT", movePct: -4.5, sourceNote: "Public session figures." },
};

describe("inbound postMessage handshake", () => {
  it("accepts an allowlisted origin and strips private fields", () => {
    expect(isAllowedOrigin("https://atlas-explain.web.app")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(DEFAULT_ALLOWED_ORIGINS.length).toBeGreaterThan(0);

    const result = readInboundMessage(
      {
        type: EXPLAIN_LOAD_MESSAGE,
        payload: { ...payload, card: { ...payload.card, notes: "leave on the device", balance: 99 } },
        concept: "signal15",
      },
      "http://localhost:3000",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context?.card.symbol).toBe("ETHUSDT");
    expect(result.value.context?.card.notes).toBeUndefined();
    expect(result.value.conceptId).toBe("signal15");
    expect(result.value.warnings.length).toBeGreaterThan(0);
    expect(inboundReply(result).type).toBe(EXPLAIN_LOADED_MESSAGE);
  });

  it("rejects a foreign origin and an unknown message type", () => {
    const foreign = readInboundMessage({ type: EXPLAIN_LOAD_MESSAGE, payload }, "https://evil.example");
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.errors[0]?.path).toBe("origin");
    expect(inboundReply(foreign).type).toBe(EXPLAIN_ERROR_MESSAGE);

    const wrongType = readInboundMessage({ type: "other/v1", payload }, "http://localhost:3000");
    expect(wrongType.ok).toBe(false);
  });
});
