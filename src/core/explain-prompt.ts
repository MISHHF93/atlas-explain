import { detectPageKind, type PageKindView } from "./page-kind";
import { SAMPLE_MOVES, type SampleMove } from "./samples";
import { TWO_SIDED_INSTRUCTION } from "./two-sided";

import { EDUCATION_SHORT } from "./links";
export const ANSWER_DISCLAIMER = EDUCATION_SHORT;

export const EXPLAIN_SYSTEM =
  "You explain trading language and market moves for education. You are not an advisor. You never tell anyone to buy, sell, hold, or size a trade. If asked for a trade decision, refuse it and explain the factors instead. You never invent prices or account details.";

export interface PageContext {
  selection: string;
  title: string;
  host: string;
  redacted: boolean;
  /** From the site name and title only; the page body is never read. */
  page: PageKindView;
}

const RECOMMENDATION =
  /\b(should i|do i|can i|what should)\b[\s\S]{0,48}\b(buy|sell|short|hold|exit|enter)\b|\b(price target|position size|all in)\b|\b(buy|sell|short)\s+(the\s+)?(stock|shares|calls|puts)\b/i;

const DIGITS = /\b\d{6,}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ACCOUNT = /\b(account|routing|iban|card)\s*(number|#|no\.?)?\s*[:#-]?\s*\S+/gi;
const BALANCE = /\b(balance|buying power|equity|cash available|net liq)\s*[:#-]?\s*\$?\s*[\d,.]+/gi;

export function isRecommendationRequest(text: string): boolean {
  return RECOMMENDATION.test(text);
}

export function redactSensitive(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const replace = () => {
    redacted = true;
    return "[redacted]";
  };
  let out = text;
  for (const rule of [ACCOUNT, BALANCE, EMAIL, DIGITS]) {
    rule.lastIndex = 0;
    out = out.replace(rule, replace);
  }
  return { text: out, redacted };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function toPageContext(raw: { selection: string; title: string; url: string }): PageContext {
  const selection = redactSensitive(clip(raw.selection, 2_000));
  const title = clip(raw.title, 180).trim();
  const host = hostOf(raw.url);
  return {
    selection: selection.text.trim(),
    title,
    host,
    redacted: selection.redacted,
    page: detectPageKind({ host, title }),
  };
}

/** Historical sample cards whose public facts match the text. */
export function relevantSamples(text: string): SampleMove[] {
  const hay = text.toLowerCase();
  return SAMPLE_MOVES.filter((sample) => sample.kind === "historical" && sampleMatches(sample, hay)).slice(0, 2);
}

export function buildExplainPrompt(input: {
  context: PageContext;
  question: string;
  samples?: readonly SampleMove[];
}): { prompt: string; refusedRecommendation: boolean } {
  const question = input.question.trim();
  const combined = `${input.context.title}\n${input.context.selection}\n${question}`;
  const refusedRecommendation = isRecommendationRequest(combined);
  const page = input.context.page ?? detectPageKind({ host: input.context.host, title: input.context.title });
  const samples = input.samples ?? relevantSamples(combined);
  const sampleBlock = samples.length
    ? samples
        .map(
          (sample) =>
            `Illustrative sample "${sample.title}" (not a live data feed):\n${JSON.stringify(
              {
                symbol: sample.card.symbol,
                asOf: sample.card.asOf,
                movePct: sample.card.movePct,
                marketLabel: sample.card.marketLabel,
                marketMovePct: sample.card.marketMovePct,
                sourceNote: sample.card.sourceNote,
              },
              null,
              2,
            )}`,
        )
        .join("\n\n")
    : "No illustrative sample card matched this text.";

  const refusal = refusedRecommendation
    ? "The user is asking for a buy, sell, or hold decision. Do not give one. Do not name a target or a position size. Explain the factors on both sides instead."
    : "If a trade decision is requested, refuse it and explain the factors instead.";

  const prompt = `${EXPLAIN_SYSTEM}

${refusal}

Explain the text in plain language. Cover trading terms (such as stop-limit, margin, spread, or IV), indicators, order types, or chart patterns when they appear. If the text is about a price move, explain factors a buyer and a seller might weigh. Use a sample card only as historical illustration.

Page context (selection, title, and site name only):
Site: ${input.context.host || "unknown"}
Site type: ${page.label}. ${page.hint}
Title: ${input.context.title || "unknown"}
Text:
${input.context.selection || "(no text)"}

Question:
${question || "Explain what this text is saying."}

${sampleBlock}

${TWO_SIDED_INSTRUCTION}
The app adds this line under every answer: ${ANSWER_DISCLAIMER}`;

  return { prompt, refusedRecommendation };
}

function sampleMatches(sample: SampleMove, hay: string): boolean {
  if (sample.card.symbol === "NVDA") return /nvda|nvidia|deepseek/.test(hay);
  if (sample.card.symbol === "AAPL") return /aapl|\bapple\b/.test(hay) && /tariff|2025|april|apr\b/.test(hay);
  if (sample.card.symbol === "SPX") return /s&p|spx|s&p 500/.test(hay) && /tariff|2025|april|apr\b/.test(hay);
  return false;
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
