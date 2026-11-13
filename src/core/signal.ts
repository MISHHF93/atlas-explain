/** Honest paper signal. Shadow models do not clear this gate today. */
export const SHADOW_MODELS_CLEAR_GATE = false;

export const MIN_SAMPLE_SIZE = 200;
export const MIN_HIT_RATE = 0.55;

export const PAPER_PREDICTION_LABEL =
  "Paper prediction from ATLAS shadow models - not investment advice";

export const CONNECT_ATLAS = "connect ATLAS";
export const NOT_ENOUGH_EVIDENCE = "not enough evidence";
export const LEANS_UP = "model leans up";
export const LEANS_DOWN = "model leans down";

export type SignalColour = "green" | "red" | "grey";

export interface PublicSignalStats {
  lean?: string;
  hitRate?: number;
  sampleSize?: number;
  reason?: string;
}

export interface SignalView {
  colour: SignalColour;
  reason: string;
  hitRateLabel: string;
  sampleLabel: string;
  paperLabel: string;
  connected: boolean;
  /** The desk's own plain-language reason, kept only when it has no trade wording. */
  deskReason?: string;
}

const TRADE_WORD = /\b(buy|sell|short|hold)\b/i;

export function mapSignal(input: {
  connected: boolean;
  signal?: PublicSignalStats | null;
  /** Test seam. Production uses SHADOW_MODELS_CLEAR_GATE. */
  modelsClearGate?: boolean;
}): SignalView {
  const gate = input.modelsClearGate ?? SHADOW_MODELS_CLEAR_GATE;
  if (!input.connected) {
    return view("grey", CONNECT_ATLAS, null, null, false);
  }

  const signal = input.signal ?? null;
  const hit = finiteUnit(signal?.hitRate);
  const sample = finiteCount(signal?.sampleSize);
  const lean = signal?.lean;
  const thin =
    !gate ||
    signal == null ||
    hit == null ||
    sample == null ||
    sample < MIN_SAMPLE_SIZE ||
    hit < MIN_HIT_RATE ||
    (lean !== "up" && lean !== "down") ||
    hasTradeWord(signal.reason);

  const deskReason = cleanReason(signal?.reason);
  if (thin) return withReason(view("grey", NOT_ENOUGH_EVIDENCE, hit, sample, true), deskReason);

  return withReason(
    view(lean === "up" ? "green" : "red", lean === "up" ? LEANS_UP : LEANS_DOWN, hit, sample, true),
    deskReason,
  );
}

function cleanReason(reason: string | undefined): string | undefined {
  if (typeof reason !== "string" || hasTradeWord(reason)) return undefined;
  const flat = reason.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > 280 ? `${flat.slice(0, 279)}…` : flat;
}

function withReason(base: SignalView, deskReason: string | undefined): SignalView {
  return deskReason ? { ...base, deskReason } : base;
}

/** Read only the public signal fields. Ignore every other key. */
export function readPublicSignal(payload: unknown): PublicSignalStats | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const source = record.signal && typeof record.signal === "object" ? record.signal as Record<string, unknown> : record;
  const lean = typeof source.lean === "string" ? source.lean : undefined;
  const hitRate = typeof source.hitRate === "number" ? source.hitRate : undefined;
  const sampleSize = typeof source.sampleSize === "number" ? source.sampleSize : undefined;
  const reason = typeof source.reason === "string" ? source.reason : undefined;
  if (lean === undefined && hitRate === undefined && sampleSize === undefined && reason === undefined) return null;
  return { lean, hitRate, sampleSize, reason };
}

export function signalText(view: SignalView): string {
  return [view.reason, view.hitRateLabel, view.sampleLabel, view.paperLabel].join(" ");
}

export function containsTradeOrder(text: string): boolean {
  return TRADE_WORD.test(text);
}

function view(
  colour: SignalColour,
  reason: string,
  hit: number | null,
  sample: number | null,
  connected: boolean,
): SignalView {
  return {
    colour,
    reason,
    hitRateLabel: hit == null ? "Hit rate —" : `Hit rate ${Math.round(hit * 100)}%`,
    sampleLabel: sample == null ? "Sample —" : `Sample ${sample}`,
    paperLabel: PAPER_PREDICTION_LABEL,
    connected,
  };
}

function finiteUnit(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

function finiteCount(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function hasTradeWord(value: string | undefined): boolean {
  return typeof value === "string" && TRADE_WORD.test(value);
}
