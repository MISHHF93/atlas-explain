export interface GlossaryEntry {
  id: string;
  title: string;
  summary: string;
}

/**
 * Short educational definitions that ATLAS Explain and the ATLAS desk
 * can share by id. The wording is descriptive only: it does not tell
 * anyone to trade, and it does not describe balances or accounts.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "shadow",
    title: "Shadow metrics",
    summary:
      "A shadow metric is a paper record of how a research model would have scored after the fact. It is used to study the model, not to place a trade, and it is not a recommendation.",
  },
  {
    id: "signal15",
    title: "Signal15",
    summary:
      "Signal15 is a 15-minute research signal on the private ATLAS desk. In this app it is only a concept to explain: a short-horizon label that can be read as a case for or against a move, never as an instruction to buy or sell.",
  },
  {
    id: "chart_layers",
    title: "Chart layers",
    summary:
      "Chart layers are optional overlays on a price chart, such as volume, indicators, or research series. Turning a layer on helps you see one more piece of context. It does not by itself say what to do next.",
  },
  {
    id: "live_lock",
    title: "Live lock",
    summary:
      "A live lock is a freshness check. It tells you whether the desk is looking at a live feed or at a held, delayed, or incomplete series, so a reading is not mistaken for a current quote.",
  },
  {
    id: "paper_only",
    title: "Paper only",
    summary:
      "Paper-only means the desk is for research and simulation. It does not send live orders and it does not grant permission to trade. Explanations of paper results stay educational.",
  },
  {
    id: "drop_study",
    title: "Drop study",
    summary:
      "A drop study looks at how a sharp decline unfolded over the following sessions: how often prices recovered, how often they kept falling, and what else was happening. It is a historical reading, not a forecast and not advice.",
  },
  {
    id: "hybrid_inference",
    title: "Hybrid inference",
    summary:
      "Hybrid inference means this app tries Gemini Nano on the device first and uses Gemini in the cloud only when the on-device model is unavailable or the card is too long. The badge names the path that actually ran. Private notes stay on the device.",
  },
  {
    id: "move_card",
    title: "Move card",
    summary:
      "A move card is a structured description of one session move: the symbol, the percent change, and optional market, peer, volume, and headline context. ATLAS Explain reads that card and writes a balanced explanation. It does not receive balances or account details.",
  },
] as const;

const BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function isGlossaryId(id: string): boolean {
  return BY_ID.has(id.trim());
}

export function getConcept(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id.trim());
}

export function conceptQuestion(id: string): string {
  const entry = getConcept(id);
  if (!entry) return "Why might some traders buy this dip while others sell?";
  return `In educational terms, what does “${entry.title}” add to a reading of this move? Do not give trade advice.`;
}

const ADVICE_PATTERN =
  /\b(buy now|sell now|you should buy|you should sell|recommend buying|recommend selling|place an order|this is a buy|this is a sell)\b/i;

export function glossaryContainsAdvice(entries: readonly GlossaryEntry[] = GLOSSARY): boolean {
  return entries.some((entry) => ADVICE_PATTERN.test(`${entry.title} ${entry.summary}`));
}
