import { LEARN_PATH, learnTerms, type LearnStep } from "./learn";
import { ALL_TERMS, type TermEntry } from "./terms";

/**
 * "Check yourself" questions and spaced review for the learning path.
 *
 * Every question is built from the glossary itself: a term's own summary, with the term's name
 * blanked out, and three names to pick from (the right one and two other glossary terms). Nothing
 * is written for the quiz, so nothing in it can be wrong in a way the glossary isn't.
 *
 * Review follows the spacing tested in a NEFE-funded Dartmouth study of financial education:
 * people who went over the material again about a week later and a month later remembered
 * significantly more. A topic passed today comes back in 1 day, then 7, then 28; a missed review
 * starts again from 1 day. Progress is kept on the person's device only.
 */
export const REVIEW_DAYS = [1, 7, 28] as const;
const DAY_MS = 86_400_000;

export interface TopicReview {
  /** How many reviews are behind it: 0 after the first pass, REVIEW_DAYS.length when kept. */
  stage: number;
  /** When it is next due (ISO), or null once every review is done. */
  due: string | null;
}
export type ReviewState = Readonly<Record<string, TopicReview>>;

const TOPIC_IDS = new Set(LEARN_PATH.map((s) => s.id));

/** Saved review state, keeping only known topics and well-formed entries. */
export function parseReview(value: unknown): ReviewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, TopicReview> = {};
  for (const [id, v] of Object.entries(value as Record<string, unknown>)) {
    if (!TOPIC_IDS.has(id) || !v || typeof v !== "object") continue;
    const { stage, due } = v as { stage?: unknown; due?: unknown };
    if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 0 || stage > REVIEW_DAYS.length) continue;
    if (due !== null && (typeof due !== "string" || Number.isNaN(Date.parse(due)))) continue;
    out[id] = { stage, due: stage >= REVIEW_DAYS.length ? null : (due as string | null) };
  }
  return out;
}

/** Enough right to pass: two of three, or all of one or two. */
export const passMark = (total: number): number => Math.ceil((total * 2) / 3);

/**
 * The state after a check on one topic. A pass moves it to its next review (the first pass starts
 * the schedule); a miss on a topic under review starts its schedule again; a miss on a topic not
 * yet started changes nothing.
 */
export function recordCheck(state: ReviewState, topic: string, right: number, total: number, now: number): ReviewState {
  if (!TOPIC_IDS.has(topic) || total < 1) return state;
  const prev = state[topic];
  if (right >= passMark(total)) {
    const stage = prev ? Math.min(prev.stage + 1, REVIEW_DAYS.length) : 0;
    const days = REVIEW_DAYS[stage];
    return { ...state, [topic]: { stage, due: days === undefined ? null : new Date(now + days * DAY_MS).toISOString() } };
  }
  if (!prev) return state;
  return { ...state, [topic]: { stage: 0, due: new Date(now + REVIEW_DAYS[0] * DAY_MS).toISOString() } };
}

/** Starts a topic's schedule when it is finished another way (every term marked learned), if it hasn't started. */
export function startReview(state: ReviewState, topic: string, now: number): ReviewState {
  return state[topic] ? state : recordCheck(state, topic, 1, 1, now);
}

/** Topics due now, in path order. */
export function dueTopics(state: ReviewState, now: number): LearnStep[] {
  return LEARN_PATH.filter((s) => {
    const due = state[s.id]?.due;
    return due != null && Date.parse(due) <= now;
  });
}

/** The next review still to come, or null. */
export function nextReview(state: ReviewState, now: number): { step: LearnStep; due: string } | null {
  let best: { step: LearnStep; due: string } | null = null;
  for (const step of LEARN_PATH) {
    const due = state[step.id]?.due;
    if (due != null && Date.parse(due) > now && (!best || Date.parse(due) < Date.parse(best.due))) best = { step, due };
  }
  return best;
}

export interface CheckQuestion {
  termId: string;
  /** The term's glossary summary, with its name blanked out. */
  prompt: string;
  options: { id: string; title: string }[];
  answerId: string;
}

/** A small seeded generator, so the same seed gives the same questions (and tests can rely on it). */
function random(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(list: readonly T[], next: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const GENERIC_WORDS = new Set(["rate", "price", "market", "bank", "order", "fund", "account", "contract", "ratio", "options", "point"]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * The summary with the term's name blanked, so the answer isn't given away: the full name, the name
 * without its bracketed part, a short bracketed abbreviation ("IV", "CPI"), and the name's last word
 * ("yield" in "Bond yield", "point" in "Basis point"), each also as a plural ("pips").
 */
export function blankTitle(term: TermEntry): string {
  const bare = term.title.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const abbreviations = [...term.title.matchAll(/\(([^(),]+)\)/g)].map((m) => m[1]!.trim());
  const lastWord = bare.split(/\s+/).pop() ?? "";
  // A generic last word ("rate", "market", "bank") isn't the answer on its own, so it stays.
  const last = GENERIC_WORDS.has(lastWord.toLowerCase()) ? "" : lastWord;
  const names = [term.title, bare, ...abbreviations, last]
    .filter((n, i, a) => n.length > 1 && a.indexOf(n) === i)
    // Longest first, so "Bond yield" is blanked whole before "yield" alone.
    .sort((a, b) => b.length - a.length);
  return names.reduce((text, name) => text.replace(new RegExp(`(?<![\\w-])${escapeRe(name)}(?:e?s)?(?![\\w-])`, "gi"), "___"), term.summary);
}

/**
 * Up to three questions on one topic: which term does this description fit? The wrong options
 * come from the same topic first, then the same glossary group, then anywhere in the glossary.
 */
export function checkQuestions(topic: string, seed: number): CheckQuestion[] {
  const step = LEARN_PATH.find((s) => s.id === topic);
  if (!step) return [];
  const next = random(seed);
  const terms = learnTerms(step);
  return shuffled(terms, next).slice(0, 3).map((term) => {
    const pool = [
      ...shuffled(terms.filter((t) => t.id !== term.id), next),
      ...shuffled(ALL_TERMS.filter((t) => t.group === term.group && !terms.includes(t)), next),
      ...shuffled(ALL_TERMS.filter((t) => t.group !== term.group && !terms.includes(t)), next),
    ];
    const options = shuffled([term, ...pool.slice(0, 2)], next).map((t) => ({ id: t.id, title: t.title }));
    return { termId: term.id, prompt: blankTitle(term), options, answerId: term.id };
  });
}
