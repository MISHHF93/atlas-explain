import { moveCardForPrompt } from "./move-card";
import { topicLabel } from "./taxonomy";
import type { MoveCard, TopicDefinition } from "./types";

export const SYSTEM_INSTRUCTION =
  "You explain completed market moves for education. You are not an advisor and you do not tell anyone to trade. You never invent numbers.";

export const DEFAULT_PROMPT_TEMPLATE = `You are the narrator for ATLAS Explain, a public educational companion.
Explain the market move in the card. This is not financial advice. Do not recommend buying, selling, holding, sizing a position, or setting a target. Do not say "you should".

Use only figures that appear in the card. If a figure is absent, say it was not provided. Do not invent prices, volumes, dates, or causes.

Classify each headline into exactly one topic id from this taxonomy:
{{TAXONOMY}}

User question:
{{QUESTION}}

Move card JSON:
{{MOVE_CARD}}

{{PRIVATE_CONTEXT}}

Return JSON with these fields:
- summary: at most 120 words, plain language, balanced
- headlineTopics: one object per headline, with headline, topic, and a short note
- buyerReasons: exactly 3 reasons someone might see the decline as an opportunity
- sellerReasons: exactly 3 reasons someone might see further downside or ongoing risk
- whatWouldChange: one short paragraph on evidence that would change either case

Reasons must be grounded in the card. If the card is thin, say what is missing instead of filling the gap with a story.`;

export function buildPrompt(input: {
  card: MoveCard;
  question: string;
  template: string;
  topics: readonly TopicDefinition[];
  includePrivateContext: boolean;
}): { prompt: string; charLength: number } {
  const question = input.question.trim()
    ? input.question.trim()
    : "No specific question. Explain the move, including why a buyer might see a dip as an opportunity and why a seller might see more risk.";

  const taxonomy = input.topics
    .map((topic) => `- ${topic.id}: ${topicLabel(topic.id, input.topics)}`)
    .join("\n");

  const privateBlock = input.includePrivateContext
    ? formatPrivate(input.card)
    : "Private notes and watchlist were not included in this request.";

  const values: Record<string, string> = {
    TAXONOMY: taxonomy,
    QUESTION: question,
    MOVE_CARD: JSON.stringify(moveCardForPrompt(input.card, input.includePrivateContext), null, 2),
    PRIVATE_CONTEXT: privateBlock,
  };

  const template = input.template.trim().length > 0 ? input.template : DEFAULT_PROMPT_TEMPLATE;
  let prompt = template;
  for (const [key, value] of Object.entries(values)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }
  if (!template.includes("{{MOVE_CARD}}")) {
    prompt += `\n\nMove card JSON:\n${values.MOVE_CARD}`;
  }
  if (!template.includes("{{PRIVATE_CONTEXT}}")) {
    prompt += `\n\n${privateBlock}`;
  }
  if (!template.includes("{{TAXONOMY}}")) {
    prompt += `\n\nTaxonomy:\n${taxonomy}`;
  }

  return { prompt, charLength: prompt.length };
}

function formatPrivate(card: MoveCard): string {
  const lines = ["Private context is included because this request is intended for the on-device model:"];
  if (card.notes?.trim()) {
    lines.push(`Notes: ${card.notes.trim()}`);
  }
  if (card.watchlist.length > 0) {
    lines.push(`Watchlist: ${card.watchlist.join(", ")}`);
  }
  lines.push("Do not treat the watchlist or notes as a recommendation. Do not repeat the notes verbatim if they are long; use them only as context.");
  return lines.join("\n");
}
