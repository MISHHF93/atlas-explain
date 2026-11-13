import { shortSelection } from "./popup-copy";
import { ALL_TERMS, type TermEntry } from "./terms";

/**
 * "Keep going" follow-ups under an answer: a simpler retelling, an everyday example,
 * and why the idea matters. Education only. Every question repeats the no-advice rule
 * and asks for no real prices, so a follow-up can never turn into a trade call.
 */

export type FollowUpKind = "simpler" | "example" | "matters";

export const FOLLOW_UPS: readonly { kind: FollowUpKind; label: string }[] = [
  { kind: "simpler", label: "Explain simpler" },
  { kind: "example", label: "Give an example" },
  { kind: "matters", label: "Why it matters" },
];

const RULE = "Education only. Do not recommend a trade or name prices to act on.";

export function followUpQuestion(kind: FollowUpKind, topic: string): string {
  const subject = shortSelection(topic, 160) || "this idea";
  if (kind === "simpler") {
    return `Explain "${subject}" again in simpler words, as if to a beginner, in three short sentences. ${RULE}`;
  }
  if (kind === "example") {
    return `Give one short everyday example that shows how "${subject}" works. Keep it clearly hypothetical and use no real prices. ${RULE}`;
  }
  return `In plain language, why does "${subject}" matter to someone reading the markets, and what is one common misunderstanding about it? ${RULE}`;
}

function keysFor(term: TermEntry): string[] {
  const title = term.title.toLowerCase();
  const bare = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const abbr = /\(([^)]+)\)/.exec(title)?.[1]?.trim();
  const keys = new Set([title, bare, term.id.replace(/_/g, " ").toLowerCase()]);
  if (abbr) keys.add(abbr);
  // "Bid-ask spread" should also match "spread"; "Stop-limit order" should match "stop-limit".
  const last = bare.split(/\s+/).pop();
  if (last && last.length >= 5 && !["order", "metrics", "layers"].includes(last)) keys.add(last);
  // "stop-limit" alone is specific enough; "market" alone is not.
  if (bare.endsWith(" order") && bare.includes("-")) keys.add(bare.slice(0, -" order".length));
  return [...keys].filter((key) => key.length >= 2);
}

function mentions(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Glossary terms mentioned in an answer or selection, in glossary order, at most `max`.
 * A term that is the topic itself is left out so the chips always lead somewhere new.
 */
export function relatedTerms(text: string, topic = "", entries: readonly TermEntry[] = ALL_TERMS, max = 3): TermEntry[] {
  const haystack = text.toLowerCase();
  const subject = topic.trim().toLowerCase();
  const found: TermEntry[] = [];
  for (const term of entries) {
    const keys = keysFor(term);
    if (subject && keys.some((key) => subject === key || mentions(subject, key))) continue;
    if (keys.some((key) => mentions(haystack, key))) found.push(term);
    if (found.length >= max) break;
  }
  return found;
}
