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

/** Chrome Prompt API (Gemini Nano). Returns null when the model is not available. */
export async function explainOnDevice(prompt: string, responseConstraint?: object): Promise<string | null> {
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
    let text: string;
    try {
      // Structured output keeps Nano's answer in the two-sided shape; older Chrome ignores or rejects it.
      text = responseConstraint ? await session.prompt(prompt, { responseConstraint }) : await session.prompt(prompt);
    } catch {
      text = await session.prompt(prompt);
    }
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}
