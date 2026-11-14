import { shortSelection } from "./popup-copy";

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

