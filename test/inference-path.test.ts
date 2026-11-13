import { describe, expect, it } from "vitest";
import { selectInferencePath } from "../src/core/inference-path";
import type { PathSelectionInput } from "../src/core/inference-path";

const limits = {
  maxHeadlinesOnDevice: 8,
  maxCharsOnDevice: 6000,
  longDocumentChars: 1200,
};

function input(overrides: Partial<PathSelectionInput> = {}): PathSelectionInput {
  return {
    preference: "prefer_on_device",
    headlineCount: 2,
    documentChars: 0,
    publicPromptChars: 1800,
    privatePromptChars: 1900,
    hasPrivateContext: false,
    limits,
    ...overrides,
  };
}

describe("selectInferencePath", () => {
  it("follows prefer_on_device when the card is short and has no private notes", () => {
    expect(selectInferencePath(input())).toEqual({
      mode: "prefer_on_device",
      includePrivateContext: false,
      retryWithoutPrivate: false,
      reason: "remote_config",
    });
  });

  it("keeps private notes on a device-only call and plans a cloud retry without them", () => {
    expect(selectInferencePath(input({ hasPrivateContext: true }))).toMatchObject({
      mode: "only_on_device",
      includePrivateContext: true,
      retryWithoutPrivate: true,
      reason: "private_context_on_device",
    });
  });

  it("never attaches private notes to a cloud-preferring mode", () => {
    expect(selectInferencePath(input({ preference: "prefer_in_cloud", hasPrivateContext: true }))).toMatchObject({
      mode: "prefer_in_cloud",
      includePrivateContext: false,
      retryWithoutPrivate: false,
    });
  });

  it("forces the cloud for many headlines, a long document, or a long prompt", () => {
    expect(selectInferencePath(input({ headlineCount: 9, preference: "only_on_device" })).reason).toBe(
      "many_headlines",
    );
    expect(selectInferencePath(input({ documentChars: 1500 })).mode).toBe("only_in_cloud");
    expect(selectInferencePath(input({ documentChars: 1500 })).reason).toBe("long_document");
    expect(selectInferencePath(input({ publicPromptChars: 8000 })).reason).toBe("long_prompt");
    expect(selectInferencePath(input({ headlineCount: 12, hasPrivateContext: true })).includePrivateContext).toBe(
      false,
    );
  });

  it("drops private notes that do not fit on device instead of sending them to the cloud", () => {
    const decision = selectInferencePath(
      input({ hasPrivateContext: true, privatePromptChars: 9000, preference: "only_on_device" }),
    );
    expect(decision).toMatchObject({
      mode: "only_on_device",
      includePrivateContext: false,
      reason: "private_context_too_long",
    });
  });
});
