import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseRemoteSettings } from "../src/core/settings";
import { TOPIC_IDS } from "../src/core/types";

describe("parseRemoteSettings", () => {
  it("uses built-in defaults when values are empty", () => {
    const { settings, warnings } = parseRemoteSettings({});
    expect(settings.inferenceMode).toBe("prefer_on_device");
    expect(settings.cloudModel).toBe(DEFAULT_SETTINGS.cloudModel);
    expect(settings.topics.map((topic) => topic.id)).toEqual([...TOPIC_IDS]);
    expect(settings.billingEnabled).toBe(false);
    expect(settings.freeCloudDailyLimit).toBe(50);
    expect(warnings).toEqual([]);
  });

  it("keeps billing off when the flag is not a boolean", () => {
    const { settings, warnings } = parseRemoteSettings({ billing_enabled: "yes", free_cloud_daily_limit: "50" });
    expect(settings.billingEnabled).toBe(false);
    expect(warnings.some((warning) => warning.includes("billing_enabled"))).toBe(true);
  });

  it("accepts a cloud model and a known inference mode", () => {
    const { settings } = parseRemoteSettings({
      inference_mode: "only_in_cloud",
      cloud_model: "gemini-3.5-flash-lite",
      max_output_tokens: "800",
    });
    expect(settings.inferenceMode).toBe("only_in_cloud");
    expect(settings.cloudModel).toBe("gemini-3.5-flash-lite");
    expect(settings.maxOutputTokens).toBe(800);
  });

  it("falls back when the mode or taxonomy is unusable", () => {
    const { settings, warnings } = parseRemoteSettings({
      inference_mode: "sometimes_on_device",
      topic_taxonomy: "{",
      on_device_max_headlines: "0",
    });
    expect(settings.inferenceMode).toBe("prefer_on_device");
    expect(settings.maxHeadlinesOnDevice).toBe(DEFAULT_SETTINGS.maxHeadlinesOnDevice);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });
});
