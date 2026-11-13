import { describe, expect, it } from "vitest";
import {
  CONNECT_ATLAS,
  LEANS_DOWN,
  LEANS_UP,
  NOT_ENOUGH_EVIDENCE,
  PAPER_PREDICTION_LABEL,
  SHADOW_MODELS_CLEAR_GATE,
  mapSignal,
  readPublicSignal,
  signalText,
} from "../src/core/signal";

const strongUp = { lean: "up", hitRate: 0.62, sampleSize: 240 };
const strongDown = { lean: "down", hitRate: 0.61, sampleSize: 240 };

describe("signal mapping", () => {
  it("defaults to grey because shadow models are below the gate", () => {
    expect(SHADOW_MODELS_CLEAR_GATE).toBe(false);
    const view = mapSignal({ connected: true, signal: strongUp });
    expect(view.colour).toBe("grey");
    expect(view.reason).toBe(NOT_ENOUGH_EVIDENCE);
  });

  it("is grey with connect ATLAS when the desk is not open", () => {
    const view = mapSignal({ connected: false, signal: strongUp, modelsClearGate: true });
    expect(view.colour).toBe("grey");
    expect(view.reason).toBe(CONNECT_ATLAS);
    expect(view.hitRateLabel).toBe("Hit rate —");
    expect(view.sampleLabel).toBe("Sample —");
  });

  it("stays grey when the sample is thin even if a gate flag is forced", () => {
    const view = mapSignal({
      connected: true,
      modelsClearGate: true,
      signal: { lean: "up", hitRate: 0.9, sampleSize: 12 },
    });
    expect(view.colour).toBe("grey");
    expect(view.reason).toBe(NOT_ENOUGH_EVIDENCE);
    expect(view.sampleLabel).toBe("Sample 12");
  });

  it("maps a cleared gate to up or down without buy or sell wording", () => {
    const up = mapSignal({ connected: true, modelsClearGate: true, signal: strongUp });
    const down = mapSignal({ connected: true, modelsClearGate: true, signal: strongDown });
    expect(up.colour).toBe("green");
    expect(up.reason).toBe(LEANS_UP);
    expect(down.colour).toBe("red");
    expect(down.reason).toBe(LEANS_DOWN);
    for (const view of [up, down, mapSignal({ connected: false })]) {
      expect(signalText(view)).not.toMatch(/\b(buy|sell)\b/i);
      expect(view.paperLabel).toBe(PAPER_PREDICTION_LABEL);
    }
  });

  it("drops a reason that tries to say buy and stays grey", () => {
    const view = mapSignal({
      connected: true,
      modelsClearGate: true,
      signal: { ...strongUp, reason: "buy the dip" },
    });
    expect(view.colour).toBe("grey");
    expect(signalText(view)).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("reads only public signal fields from an explain payload", () => {
    expect(readPublicSignal({
      v: 1,
      kind: "move_card",
      card: { symbol: "NVDA", movePct: -6 },
      signal: { lean: "up", hitRate: 0.5, sampleSize: 10, balance: 1000 },
    })).toEqual({ lean: "up", hitRate: 0.5, sampleSize: 10, reason: undefined });
    expect(readPublicSignal({ symbol: "NVDA", movePct: -6 })).toBeNull();
  });

  it("keeps the desk reason from the ATLAS signal_light payload, but never a trade word", () => {
    const payload = {
      v: 1,
      kind: "signal_light",
      colour: "grey",
      signal: { lean: "none", hitRate: null, sampleSize: 13, reason: "Not enough evidence: thin data (13 of 200 labelled outcomes). The light stays grey." },
      gate: { passed: false },
    };
    const view = mapSignal({ connected: true, signal: readPublicSignal(payload) });
    expect(view.colour).toBe("grey");
    expect(view.hitRateLabel).toBe("Hit rate —");
    expect(view.sampleLabel).toBe("Sample 13");
    expect(view.deskReason).toContain("thin data");
    const sneaky = mapSignal({ connected: true, signal: { lean: "up", hitRate: 0.6, sampleSize: 300, reason: "sell now" } });
    expect(sneaky.deskReason).toBeUndefined();
  });
});
