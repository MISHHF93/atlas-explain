import { hasPrivateContext } from "./move-card";
import { selectInferencePath } from "./inference-path";
import { ExplanationParseError, parseExplanation } from "./parse-explanation";
import { SYSTEM_INSTRUCTION, buildPrompt } from "./prompt";
import type {
  AppSettings,
  ExplainHooks,
  ExplanationRun,
  HybridExplainer,
  MoveCard,
  TopicId,
} from "./types";

export class OnDeviceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "OnDeviceUnavailableError";
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export async function runExplanation(input: {
  card: MoveCard;
  question: string;
  settings: AppSettings;
  explainer: HybridExplainer;
  hooks?: ExplainHooks;
}): Promise<ExplanationRun> {
  const topics = input.settings.topics;
  const topicIds: TopicId[] = topics.map((topic) => topic.id);
  const hasPrivate = hasPrivateContext(input.card);

  const publicPrompt = buildPrompt({
    card: input.card,
    question: input.question,
    template: input.settings.promptTemplate,
    topics,
    includePrivateContext: false,
  });
  const privatePrompt = hasPrivate
    ? buildPrompt({
        card: input.card,
        question: input.question,
        template: input.settings.promptTemplate,
        topics,
        includePrivateContext: true,
      })
    : publicPrompt;

  const decision = selectInferencePath({
    preference: input.settings.inferenceMode,
    headlineCount: input.card.headlines.length,
    documentChars: input.card.document?.length ?? 0,
    publicPromptChars: publicPrompt.charLength,
    privatePromptChars: privatePrompt.charLength,
    hasPrivateContext: hasPrivate,
    limits: {
      maxHeadlinesOnDevice: input.settings.maxHeadlinesOnDevice,
      maxCharsOnDevice: input.settings.maxCharsOnDevice,
      longDocumentChars: input.settings.longDocumentChars,
    },
  });

  const prompt = decision.includePrivateContext ? privatePrompt.prompt : publicPrompt.prompt;

  const call = (mode: ExplanationRun["requestedMode"], text: string) =>
    input.explainer.explain(
      {
        mode,
        prompt: text,
        cloudModel: input.settings.cloudModel,
        maxOutputTokens: input.settings.maxOutputTokens,
        topics: topicIds,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      input.hooks,
    );

  let result;
  let fellBackToCloud = false;
  let requestedMode = decision.mode;
  let promptUsed = prompt;
  let privateContextUsed = decision.includePrivateContext;

  try {
    result = await call(decision.mode, prompt);
  } catch (error) {
    if (decision.retryWithoutPrivate && error instanceof OnDeviceUnavailableError) {
      fellBackToCloud = true;
      requestedMode = "only_in_cloud";
      promptUsed = publicPrompt.prompt;
      privateContextUsed = false;
      result = await call("only_in_cloud", publicPrompt.prompt);
    } else {
      throw error;
    }
  }

  let explanation;
  try {
    explanation = parseExplanation(result.rawText, topicIds);
  } catch (error) {
    if (error instanceof ExplanationParseError) throw error;
    throw new ExplanationParseError("The model response could not be read.", result.rawText);
  }

  return {
    explanation,
    inferenceSource: result.inferenceSource,
    requestedMode,
    pathReason: decision.reason,
    privateContextUsed,
    fellBackToCloud,
    cloudModel: input.settings.cloudModel,
    prompt: promptUsed,
  };
}
