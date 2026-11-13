import { beforeEach, describe, expect, it } from "vitest";
import type { HybridExplainer, MoveCard } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { OnDeviceUnavailableError, runExplanation } from "../src/core/run-explanation";

const card: MoveCard = {
  symbol: "NVDA",
  movePct: -6,
  headlines: [{ text: "Spending fears returned." }],
  peerMoves: [],
  upcomingEvents: [],
  watchlist: ["AMD"],
  notes: "SECRET-NOTE-DO-NOT-LEAK",
};

const goodJson = JSON.stringify({
  summary: "The card shows a drop with little else filled in.",
  headlineTopics: [{ headline: "Spending fears returned.", topic: "ai_capex", note: "capex" }],
  buyerReasons: ["One", "Two", "Three"],
  sellerReasons: ["Four", "Five", "Six"],
  whatWouldChange: "A primary filing would change the picture.",
});

describe("runExplanation", () => {
  let calls: { mode: string; prompt: string }[];

  beforeEach(() => {
    calls = [];
  });

  it("retries in the cloud without private notes when the device model is unavailable", async () => {
    const explainer: HybridExplainer = {
      async explain(request) {
        calls.push({ mode: request.mode, prompt: request.prompt });
        if (calls.length === 1) {
          throw new OnDeviceUnavailableError("Gemini Nano is not available.");
        }
        return { rawText: goodJson, inferenceSource: "in_cloud" };
      },
    };

    const run = await runExplanation({
      card,
      question: "Why the dip?",
      settings: DEFAULT_SETTINGS,
      explainer,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.mode).toBe("only_on_device");
    expect(calls[0]?.prompt).toContain("SECRET-NOTE-DO-NOT-LEAK");
    expect(calls[1]?.mode).toBe("only_in_cloud");
    expect(calls[1]?.prompt).not.toContain("SECRET-NOTE-DO-NOT-LEAK");
    expect(run.fellBackToCloud).toBe(true);
    expect(run.privateContextUsed).toBe(false);
    expect(run.inferenceSource).toBe("in_cloud");
    expect(run.explanation.buyerReasons).toEqual(["One", "Two", "Three"]);
  });

  it("does not retry a device failure when the user asked for only-on-device", async () => {
    const explainer: HybridExplainer = {
      async explain() {
        throw new OnDeviceUnavailableError("Gemini Nano is not available.");
      },
    };
    await expect(
      runExplanation({
        card: { ...card, notes: undefined, watchlist: [] },
        question: "",
        settings: { ...DEFAULT_SETTINGS, inferenceMode: "only_on_device" },
        explainer,
      }),
    ).rejects.toBeInstanceOf(OnDeviceUnavailableError);
  });
});
