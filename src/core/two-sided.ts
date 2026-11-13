import { extractJson } from "./parse-explanation";

/**
 * The web app's two-sided answer shape, for the extension: a plain summary, three
 * reasons a buyer might weigh, three a seller might weigh, and what would change the
 * picture. Descriptive only; neither side is an instruction.
 */
export interface TwoSided {
  summary: string;
  buyerReasons: string[];
  sellerReasons: string[];
  whatWouldChange: string;
}

/** JSON Schema for Chrome's Prompt API `responseConstraint` (and the cloud prompt). */
export const TWO_SIDED_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    buyerReasons: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    sellerReasons: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    whatWouldChange: { type: "string" },
  },
  required: ["summary", "buyerReasons", "sellerReasons", "whatWouldChange"],
  additionalProperties: false,
} as const;

export const TWO_SIDED_INSTRUCTION = `Answer as JSON only, with exactly these keys:
{"summary": "two or three plain sentences explaining the highlighted text",
 "buyerReasons": ["three short reasons a buyer might read this as opportunity"],
 "sellerReasons": ["three short reasons a seller might read this as risk"],
 "whatWouldChange": "one sentence on what new fact would change either reading"}
If the text is a term rather than a move, use the two lists for how the term can help and what can go wrong. Never tell anyone to trade.`;

const MAX_REASON = 280;

/**
 * Lenient parse: Gemini Nano sometimes wraps JSON in prose or fences, or returns two
 * reasons instead of three. Returns null when the answer is not two-sided, so the
 * caller can fall back to plain text instead of hiding it.
 */
export function parseTwoSided(raw: string): TwoSided | null {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary = text(record.summary);
  const buyerReasons = reasons(record.buyerReasons);
  const sellerReasons = reasons(record.sellerReasons);
  if (!summary || buyerReasons.length < 2 || sellerReasons.length < 2) return null;
  return { summary, buyerReasons, sellerReasons, whatWouldChange: text(record.whatWouldChange) };
}

export function twoSidedCopyText(answer: TwoSided, disclaimer: string): string {
  return [
    answer.summary,
    "",
    "Opportunity case:",
    ...answer.buyerReasons.map((r) => `- ${r}`),
    "",
    "Risk case:",
    ...answer.sellerReasons.map((r) => `- ${r}`),
    ...(answer.whatWouldChange ? ["", `What would change: ${answer.whatWouldChange}`] : []),
    "",
    disclaimer,
  ].join("\n");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 1_200) : "";
}

function reasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, MAX_REASON))
    .slice(0, 3);
}
