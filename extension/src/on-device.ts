interface PromptSession {
  prompt: (input: string, options?: { responseConstraint?: object }) => Promise<string>;
  destroy?: () => void;
}

interface LanguageModelGlobal {
  availability: () => Promise<string>;
  create: (options?: {
    expectedInputs?: { type: "text"; languages?: string[] }[];
    expectedOutputs?: { type: "text"; languages?: string[] }[];
  }) => Promise<PromptSession>;
}

import { withDeadline } from "../../src/core/timeouts";

/** Prompt deadline for Gemini Nano before the cloud takes over. */
export const ON_DEVICE_PROMPT_DEADLINE_MS = 45_000;

/**
 * Whether to try Nano now. Only "available" counts: "downloadable" and "downloading"
 * would make create() wait for a multi-gigabyte download, which left the popup spinning.
 */
export function shouldUseOnDevice(availability: string): boolean {
  return availability === "available" || availability === "readily";
}

/** Chrome Prompt API (Gemini Nano). Returns null when the model is not ready right now. */
export async function explainOnDevice(prompt: string, responseConstraint?: object): Promise<string | null> {
  const model = (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
  if (!model) return null;
  let availability: string;
  try {
    availability = await model.availability();
  } catch {
    return null;
  }
  if (!shouldUseOnDevice(availability)) return null;
  let session: PromptSession | null = null;
  try {
    session = await model.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    let text: string;
    try {
      // Structured output keeps Nano's answer in the two-sided shape; older Chrome ignores or rejects it.
      text = await withDeadline(
        responseConstraint ? session.prompt(prompt, { responseConstraint }) : session.prompt(prompt),
        ON_DEVICE_PROMPT_DEADLINE_MS,
        "Gemini Nano took too long.",
      );
    } catch (error) {
      if (error instanceof Error && error.name === "DeadlineError") return null;
      text = await withDeadline(session.prompt(prompt), ON_DEVICE_PROMPT_DEADLINE_MS, "Gemini Nano took too long.");
    }
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}
