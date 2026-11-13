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
});
