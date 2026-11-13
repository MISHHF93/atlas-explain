import { ALL_TERMS, type TermEntry } from "./terms";

/**
 * A short guided path through the glossary. Progress is a set of term ids
 * kept on this device. Lessons describe concepts; none of them suggests a trade.
 */
export interface LearnStep {
  id: string;
  title: string;
  terms: readonly string[];
}

export const LEARN_PATH: readonly LearnStep[] = [
  { id: "orders", title: "How orders fill", terms: ["market_order", "stop_limit", "spread"] },
  { id: "moves", title: "Reading a move", terms: ["volume", "gap", "implied_volatility"] },
  { id: "risk", title: "Measuring risk", terms: ["margin", "drawdown", "hit_rate"] },
  { id: "atlas", title: "How ATLAS researches", terms: ["paper_only", "shadow", "signal15", "chart_layers", "live_lock", "drop_study"] },
  { id: "explain", title: "How Explain answers", terms: ["move_card", "hybrid_inference"] },
];

export const LEARN_KEY = "learned";

export function learnTerms(step: LearnStep): TermEntry[] {
  return step.terms.map((id) => ALL_TERMS.find((term) => term.id === id)).filter((t): t is TermEntry => Boolean(t));
}

export function parseLearned(value: unknown): Set<string> {
  const known = new Set(ALL_TERMS.map((t) => t.id));
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && known.has(v)) : []);
}

export interface LearnProgress {
  done: number;
  total: number;
  /** The next unlearned term in path order, or null when the path is complete. */
  next: { step: LearnStep; term: TermEntry } | null;
}

export function learnProgress(learned: ReadonlySet<string>): LearnProgress {
  let done = 0;
  let total = 0;
  let next: LearnProgress["next"] = null;
  for (const step of LEARN_PATH) {
    for (const term of learnTerms(step)) {
      total += 1;
      if (learned.has(term.id)) done += 1;
      else next ??= { step, term };
    }
  }
  return { done, total, next };
}
