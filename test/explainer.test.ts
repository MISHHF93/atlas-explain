import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const initializeDeviceModel = vi.fn();
  const getGenerativeModel = vi.fn(() => ({ generateContent, initializeDeviceModel }));
  const getAI = vi.fn(() => ({ mocked: true }));
  const GoogleAIBackend = vi.fn();
  return { generateContent, initializeDeviceModel, getGenerativeModel, getAI, GoogleAIBackend };
});

vi.mock("firebase/ai", () => ({
  getAI: mocks.getAI,
  getGenerativeModel: mocks.getGenerativeModel,
  GoogleAIBackend: mocks.GoogleAIBackend,
  InferenceMode: {
    PREFER_ON_DEVICE: "prefer_on_device",
    ONLY_ON_DEVICE: "only_on_device",
    ONLY_IN_CLOUD: "only_in_cloud",
    PREFER_IN_CLOUD: "prefer_in_cloud",
  },
  InferenceSource: {
    ON_DEVICE: "on_device",
    IN_CLOUD: "in_cloud",
  },
  Schema: {
    object: (value: unknown) => ({ kind: "object", value }),
    array: (value: unknown) => ({ kind: "array", value }),
    string: (value?: unknown) => ({ kind: "string", value }),
    enumString: (value: unknown) => ({ kind: "enum", value }),
  },
}));

import { OnDeviceUnavailableError } from "../src/core/run-explanation";
import { createFirebaseExplainer, explainWithHybridModel } from "../src/platform/web/explainer";
import type { HybridExplainRequest } from "../src/core/types";

const request = (mode: HybridExplainRequest["mode"]): HybridExplainRequest => ({
  mode,
  prompt: "Explain NVDA.",
  cloudModel: "gemini-3.5-flash-lite",
  maxOutputTokens: 1200,
  topics: ["ai_capex", "other"],
  systemInstruction: "Do not give advice.",
});

describe("Firebase AI Logic hybrid explainer", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
    mocks.initializeDeviceModel.mockReset();
    mocks.getGenerativeModel.mockClear();
    mocks.initializeDeviceModel.mockResolvedValue(undefined);
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () => "{\"summary\":\"ok\"}",
        inferenceSource: "on_device",
      },
    });
  });

  it("constructs getAI with the Gemini Developer API backend", () => {
    createFirebaseExplainer({} as never);
    expect(mocks.getAI).toHaveBeenCalledWith(expect.anything(), {
      backend: expect.any(mocks.GoogleAIBackend),
    });
    expect(mocks.GoogleAIBackend).toHaveBeenCalled();
  });

  it("calls getGenerativeModel with PREFER_ON_DEVICE, initializes the device model, and reads inferenceSource", async () => {
    const result = await explainWithHybridModel({} as never, request("prefer_on_device"), {
      onDeviceDownloadProgress: () => undefined,
    });

    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mode: "prefer_on_device",
        inCloudParams: expect.objectContaining({
          model: "gemini-3.5-flash-lite",
          generationConfig: expect.objectContaining({
            responseMimeType: "application/json",
          }),
        }),
        onDeviceParams: expect.objectContaining({
          promptOptions: expect.objectContaining({
            responseConstraint: expect.anything(),
          }),
        }),
      }),
      expect.objectContaining({ timeout: 45_000 }),
    );
    expect(mocks.initializeDeviceModel).toHaveBeenCalledTimes(1);
    expect(mocks.generateContent).toHaveBeenCalledWith("Explain NVDA.");
    expect(result.inferenceSource).toBe("on_device");
  });

  it("skips device initialization for ONLY_IN_CLOUD and reports the cloud path", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () => "{\"summary\":\"cloud\"}",
        inferenceSource: "in_cloud",
      },
    });
    const result = await explainWithHybridModel({} as never, request("only_in_cloud"));
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "only_in_cloud" }),
      expect.objectContaining({ timeout: 45_000 }),
    );
    expect(mocks.initializeDeviceModel).not.toHaveBeenCalled();
    expect(result.inferenceSource).toBe("in_cloud");
  });

  it("turns an ONLY_ON_DEVICE initialization failure into OnDeviceUnavailableError", async () => {
    mocks.initializeDeviceModel.mockRejectedValue(new Error("LanguageModel is unavailable"));
    await expect(explainWithHybridModel({} as never, request("only_on_device"))).rejects.toBeInstanceOf(
      OnDeviceUnavailableError,
    );
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("still calls generateContent when PREFER_ON_DEVICE cannot finish the download", async () => {
    mocks.initializeDeviceModel.mockRejectedValue(new Error("download needs a gesture"));
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () => "{\"summary\":\"cloud fallback\"}",
        inferenceSource: "in_cloud",
      },
    });
    const result = await explainWithHybridModel({} as never, request("prefer_on_device"));
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(result.inferenceSource).toBe("in_cloud");
  });
});
