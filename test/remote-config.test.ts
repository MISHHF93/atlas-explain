import { describe, expect, it } from "vitest";
import template from "../remoteconfig.template.json";
import { remoteConfigDefaults } from "../src/core/settings";

describe("remoteconfig.template.json", () => {
  it("matches the in-app Remote Config defaults", () => {
    const defaults = remoteConfigDefaults();
    expect(Object.keys(template.parameters).sort()).toEqual(Object.keys(defaults).sort());
    for (const [key, value] of Object.entries(defaults)) {
      expect(template.parameters[key as keyof typeof template.parameters]?.defaultValue.value).toBe(value);
    }
  });

  it("has no price-feed switch (prices come only from the captured file) and never commits a key", () => {
    expect("price_provider" in template.parameters).toBe(false);
    expect("coingecko_demo_api_key" in template.parameters).toBe(false);
    expect(template.parameters.logo_dev_token.defaultValue.value).toBe("");
    expect(JSON.stringify(template)).not.toMatch(/CG-[A-Za-z0-9]{8,}/);
  });
});
