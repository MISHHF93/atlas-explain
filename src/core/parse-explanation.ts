import { coerceTopic, isTopicId } from "./taxonomy";
import type { HeadlineClassification, ParsedExplanation, TopicId } from "./types";

export class ExplanationParseError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "ExplanationParseError";
    this.rawText = rawText;
  }
}

/**
 * Turns model text into the fixed explanation shape.
 * Unknown topic labels are coerced to `other` (or a known alias) so a drift
 * in wording does not hide the rest of the answer.
 */
export function parseExplanation(
  rawText: string,
  allowed: readonly TopicId[],
): ParsedExplanation {
  const jsonText = extractJson(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ExplanationParseError("The model did not return JSON.", rawText);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ExplanationParseError("The model JSON was not an object.", rawText);
  }

  const record = parsed as Record<string, unknown>;
  const summary = readRequiredString(record.summary, "summary", rawText);
  const whatWouldChange = readRequiredString(record.whatWouldChange, "whatWouldChange", rawText);
  const headlineTopics = readHeadlineTopics(record.headlineTopics, allowed, rawText);
  const buyer = readReasons(record.buyerReasons, "buyerReasons", rawText);
  const seller = readReasons(record.sellerReasons, "sellerReasons", rawText);

  return {
    summary,
    whatWouldChange,
    headlineTopics,
    buyerReasons: buyer.reasons,
    sellerReasons: seller.reasons,
    truncatedReasons: buyer.truncated || seller.truncated,
  };
}

export function extractJson(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return body;
  }
  return body.slice(start, end + 1);
}

function readRequiredString(value: unknown, field: string, rawText: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ExplanationParseError(`The model response is missing ${field}.`, rawText);
  }
  return value.trim();
}

function readReasons(
  value: unknown,
  field: string,
  rawText: string,
): { reasons: [string, string, string]; truncated: boolean } {
  if (!Array.isArray(value)) {
    throw new ExplanationParseError(`${field} must be an array of 3 reasons.`, rawText);
  }
  const reasons = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (reasons.length < 3) {
    throw new ExplanationParseError(`${field} needs exactly 3 reasons; received ${reasons.length}.`, rawText);
  }
  return {
    reasons: [reasons[0]!, reasons[1]!, reasons[2]!],
    truncated: reasons.length > 3,
  };
}

function readHeadlineTopics(
  value: unknown,
  allowed: readonly TopicId[],
  rawText: string,
): HeadlineClassification[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ExplanationParseError("headlineTopics must be an array.", rawText);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExplanationParseError(`headlineTopics[${index}] must be an object.`, rawText);
    }
    const record = item as Record<string, unknown>;
    const headline = typeof record.headline === "string" ? record.headline.trim() : "";
    if (headline.length === 0) {
      throw new ExplanationParseError(`headlineTopics[${index}].headline is missing.`, rawText);
    }
    const note = typeof record.note === "string" ? record.note.trim() : "";
    const topicValue = record.topic;
    if (typeof topicValue === "string" && isTopicId(topicValue) && !allowed.includes(topicValue)) {
      return { headline, topic: "other" as const, note, coerced: true };
    }
    const coerced = coerceTopic(topicValue, allowed);
    return { headline, topic: coerced.topic, note, coerced: coerced.coerced };
  });
}
