interface PromptSession {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
}

interface LanguageModelGlobal {
  availability: () => Promise<string>;
  create: (options?: {
    expectedInputs?: { type: "text"; languages?: string[] }[];
    expectedOutputs?: { type: "text"; languages?: string[] }[];
  }) => Promise<PromptSession>;
}

/** Chrome Prompt API (Gemini Nano). Returns null when the model is not available. */
export async function explainOnDevice(prompt: string): Promise<string | null> {
  const model = (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
  if (!model) return null;
  let availability: string;
  try {
    availability = await model.availability();
  } catch {
    return null;
  }
  if (availability === "unavailable" || availability === "no") return null;
  let session: PromptSession | null = null;
  try {
    session = await model.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    const text = await session.prompt(prompt);
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}
