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

const SESSION_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

/**
 * One session made ahead of time, used once by the next question, then destroyed. Starting
 * Gemini Nano when the popup opens (Chrome's guidance: create the session as soon as intent is
 * clear) means the first answer does not wait for the model to load. A session keeps the context
 * of earlier prompts, so it is never reused for a second question.
 */
let spare: Promise<PromptSession | null> | null = null;

function languageModel(): LanguageModelGlobal | undefined {
  return (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
}

/** Load Gemini Nano now if it is already on this computer. Never starts a download. */
export async function warmOnDevice(): Promise<void> {
  const model = languageModel();
  if (!model || spare) return;
  try {
    if (!shouldUseOnDevice(await model.availability())) return;
  } catch {
    return;
  }
  spare = model.create(SESSION_OPTIONS).catch(() => null);
}

/** Chrome Prompt API (Gemini Nano). Returns null when the model is not ready right now. */
export async function explainOnDevice(prompt: string, responseConstraint?: object): Promise<string | null> {
  const model = languageModel();
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
    // Take the warmed-up session if there is one; otherwise make one now.
    const warm = spare;
    spare = null;
    session = (warm ? await warm : null) ?? (await model.create(SESSION_OPTIONS));
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
