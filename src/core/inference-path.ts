import type { InferenceModeName, PathDecision, PathLimits, PathReason } from "./types";

export interface PathSelectionInput {
  preference: InferenceModeName;
  headlineCount: number;
  documentChars: number;
  publicPromptChars: number;
  privatePromptChars: number;
  hasPrivateContext: boolean;
  limits: PathLimits;
}

/**
 * Chooses the Firebase AI Logic inference mode before the SDK call.
 * The SDK still decides the actual path for PREFER_* modes and reports it
 * on `response.inferenceSource`. Long inputs are forced to the cloud because
 * on-device Gemini Nano has a small context (9216 tokens in the web SDK).
 * Private notes are included only when the call is device-only.
 */
export function selectInferencePath(input: PathSelectionInput): PathDecision {
  const overHeadlines = input.headlineCount > input.limits.maxHeadlinesOnDevice;
  const overDocument = input.documentChars > input.limits.longDocumentChars;
  const publicTooLong = input.publicPromptChars > input.limits.maxCharsOnDevice;

  if (overDocument || overHeadlines || publicTooLong) {
    const reason: PathReason = overDocument
      ? "long_document"
      : overHeadlines
        ? "many_headlines"
        : "long_prompt";
    return {
      mode: "only_in_cloud",
      includePrivateContext: false,
      retryWithoutPrivate: false,
      reason,
    };
  }

  const privateFits = input.privatePromptChars <= input.limits.maxCharsOnDevice;

  if (input.preference === "only_in_cloud" || input.preference === "prefer_in_cloud") {
    return {
      mode: input.preference,
      includePrivateContext: false,
      retryWithoutPrivate: false,
      reason: "remote_config",
    };
  }

  if (input.hasPrivateContext && !privateFits) {
    return {
      mode: input.preference,
      includePrivateContext: false,
      retryWithoutPrivate: false,
      reason: "private_context_too_long",
    };
  }

  if (input.preference === "only_on_device") {
    return {
      mode: "only_on_device",
      includePrivateContext: input.hasPrivateContext,
      retryWithoutPrivate: false,
      reason: "remote_config",
    };
  }

  if (input.hasPrivateContext) {
    return {
      mode: "only_on_device",
      includePrivateContext: true,
      retryWithoutPrivate: true,
      reason: "private_context_on_device",
    };
  }

  return {
    mode: "prefer_on_device",
    includePrivateContext: false,
    retryWithoutPrivate: false,
    reason: "remote_config",
  };
}

export function describePathReason(reason: PathReason): string {
  switch (reason) {
    case "remote_config":
      return "The inference mode comes from Remote Config (or the in-app default).";
    case "many_headlines":
      return "There are more headlines than the on-device limit, so this request uses the cloud model. Private notes were left out.";
    case "long_prompt":
      return "The prompt is too long for the on-device model, so this request uses the cloud model. Private notes were left out.";
    case "long_document":
      return "The attached document is long, so this request uses the cloud model. Private notes were left out.";
    case "private_context_on_device":
      return "Notes or a watchlist are attached, so this request stays on-device. If Gemini Nano is unavailable, a cloud retry omits them.";
    case "private_context_too_long":
      return "The private notes do not fit the on-device limit, so they were left out of the prompt.";
  }
}
