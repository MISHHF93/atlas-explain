import {
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  getAI,
  getGenerativeModel,
  type AI,
  type InferenceMode as SdkInferenceMode,
  type ObjectSchema,
} from "firebase/ai";
import type { FirebaseApp } from "firebase/app";
import { OnDeviceUnavailableError } from "../../core/run-explanation";
import { SYSTEM_INSTRUCTION } from "../../core/prompt";
import { DEVICE_INIT_DEADLINE_MS, withDeadline } from "../../core/timeouts";
import type {
  ExplainHooks,
  HybridExplainRequest,
  HybridExplainResult,
  HybridExplainer,
  InferenceModeName,
  InferenceSourceName,
} from "../../core/types";

/**
 * Firebase AI Logic hybrid inference.
 *
 * Docs (read against firebase@13.3.0 typings in `@firebase/ai`):
 * - https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
 * - https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
 * - https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output
 *
 * `getGenerativeModel` is called with `mode: InferenceMode.PREFER_ON_DEVICE`
 * (or ONLY_ON_DEVICE / PREFER_IN_CLOUD / ONLY_IN_CLOUD). On-device uses Chrome's
 * Prompt API (Gemini Nano). The cloud fallback is Gemini via `GoogleAIBackend`.
 * `response.inferenceSource` reports which path actually ran.
 */
const SDK_MODE: Record<InferenceModeName, SdkInferenceMode> = {
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

export function createFirebaseExplainer(app: FirebaseApp): HybridExplainer {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return {
    explain(request, hooks) {
      return explainWithHybridModel(ai, request, hooks);
    },
  };
}

export function explanationSchema(topics: readonly string[]): ObjectSchema {
  const topicSchema = Schema.enumString({
    enum: [...topics],
    description: "Topic id from the fixed taxonomy.",
  });
  return Schema.object({
    description: "Balanced educational explanation. Not a recommendation.",
    properties: {
      summary: Schema.string({ description: "Plain-language explanation in at most 120 words." }),
      headlineTopics: Schema.array({
        items: Schema.object({
          properties: {
            headline: Schema.string(),
            topic: topicSchema,
            note: Schema.string(),
          },
        }),
      }),
      buyerReasons: Schema.array({
        minItems: 3,
        maxItems: 3,
        items: Schema.string(),
      }),
      sellerReasons: Schema.array({
        minItems: 3,
        maxItems: 3,
        items: Schema.string(),
      }),
      whatWouldChange: Schema.string(),
    },
  });
}

/** Schema for a highlight or typed text: same two-sided shape as the extension (core/two-sided.ts). */
export function twoSidedSchema(): ObjectSchema {
  return Schema.object({
    description: "Plain-language educational explanation of a term or text. Not a recommendation.",
    properties: {
      summary: Schema.string({ description: "Two or three plain sentences." }),
      buyerReasons: Schema.array({ minItems: 3, maxItems: 3, items: Schema.string() }),
      sellerReasons: Schema.array({ minItems: 3, maxItems: 3, items: Schema.string() }),
      whatWouldChange: Schema.string(),
    },
  });
}

export async function explainWithHybridModel(
  ai: AI,
  request: HybridExplainRequest,
  hooks?: ExplainHooks,
): Promise<HybridExplainResult> {
  const mode = SDK_MODE[request.mode];
  const schema = request.shape === "two_sided" ? twoSidedSchema() : explanationSchema(request.topics);
  const systemInstruction = request.systemInstruction || SYSTEM_INSTRUCTION;

  const model = getGenerativeModel(
    ai,
    {
      mode,
      inCloudParams: {
        model: request.cloudModel,
        systemInstruction,
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          initialPrompts: [
            {
              role: "system",
              content: [{ type: "text", value: systemInstruction }],
            },
          ],
        },
        promptOptions: {
          responseConstraint: schema,
        },
      },
    },
    { timeout: 45_000 },
  );

  if (mode !== InferenceMode.ONLY_IN_CLOUD) {
    try {
      // Must run from a user gesture (the Explain click) before generateContent.
      // A first-time Gemini Nano download can take minutes. Do not hold the answer for it:
      // after the deadline PREFER_ON_DEVICE answers from the cloud while Chrome keeps downloading.
      await withDeadline(
        model.initializeDeviceModel((progressValue) => {
          hooks?.onDeviceDownloadProgress?.(progressValue);
        }),
        DEVICE_INIT_DEADLINE_MS,
        "Gemini Nano is still getting ready on this device.",
      );
    } catch (error) {
      if (mode === InferenceMode.ONLY_ON_DEVICE) {
        throw new OnDeviceUnavailableError(
          "Gemini Nano is not available in this browser yet.",
          { cause: error },
        );
      }
    }
  }

  try {
    const result = await model.generateContent(request.prompt);
    const rawText = result.response.text();
    return {
      rawText,
      inferenceSource: normalizeSource(result.response.inferenceSource, mode),
    };
  } catch (error) {
    if (mode === InferenceMode.ONLY_ON_DEVICE) {
      const message = error instanceof Error ? error.message : "On-device inference failed.";
      throw new OnDeviceUnavailableError(message, { cause: error });
    }
    throw error;
  }
}

function normalizeSource(
  source: InferenceSource | undefined,
  mode: SdkInferenceMode,
): InferenceSourceName {
  if (source === InferenceSource.ON_DEVICE) return "on_device";
  if (source === InferenceSource.IN_CLOUD) return "in_cloud";
  if (mode === InferenceMode.ONLY_ON_DEVICE) return "on_device";
  if (mode === InferenceMode.ONLY_IN_CLOUD) return "in_cloud";
  return "unknown";
}
