import { publicMoveCard, validateMoveCard } from "./move-card";
import { isGlossaryId } from "./glossary";
import type { FieldError, MoveCard } from "./types";

export const CONTEXT_VERSION = 1;
export const MAX_CONTEXT_CHARS = 8_000;

export type ContextSource = "atlas_desk" | "extension" | "paste" | "deep_link" | "post_message";

export interface ExplainContextV1 {
  v: 1;
  kind: "move_card";
  source?: ContextSource;
  card: MoveCard;
  question?: string;
  concepts?: string[];
}

export interface ParsedContextLink {
  context?: ExplainContextV1;
  conceptId?: string;
  warnings: string[];
}

const FORBIDDEN_KEYS = new Set([
  "notes",
  "watchlist",
  "balance",
  "balances",
  "account",
  "accounts",
  "accountid",
  "account_id",
  "accountnumber",
  "position",
  "positions",
  "apikey",
  "api_key",
  "secret",
  "secrets",
  "token",
  "accesstoken",
  "order",
  "orders",
  "orderid",
  "ticket",
  "tickets",
  "equity",
  "buyingpower",
  "buying_power",
  "uid",
  "userid",
  "user_id",
  "password",
  "credential",
  "credentials",
  "portfolio",
  "pnl",
  "realizedpnl",
  "unrealizedpnl",
  "cash",
  "settledcash",
]);

const SOURCE_IDS = new Set<ContextSource>([
  "atlas_desk",
  "extension",
  "paste",
  "deep_link",
  "post_message",
]);

/**
 * Recursively drop balances, accounts, notes, watchlists, and other
 * private or money fields. Public move-card keys, including sourceNote,
 * are kept.
 */
export function stripForbidden(
  input: unknown,
  path = "$",
  stripped: string[] = [],
): unknown {
  if (Array.isArray(input)) {
    return input.map((item, index) => stripForbidden(item, `${path}[${index}]`, stripped));
  }
  if (!input || typeof input !== "object") return input;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isForbiddenKey(key)) {
      stripped.push(path === "$" ? key : `${path}.${key}`);
      continue;
    }
    output[key] = stripForbidden(value, path === "$" ? key : `${path}.${key}`, stripped);
  }
  return output;
}

export function isForbiddenKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (normalized === "sourcenote") return false;
  return FORBIDDEN_KEYS.has(normalized);
}

export function parseExplainContext(
  input: unknown,
  source: ContextSource = "deep_link",
): { ok: true; value: ParsedContextLink } | { ok: false; errors: FieldError[] } {
  const strippedPaths: string[] = [];
  const cleaned = stripForbidden(input, "$", strippedPaths);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    return { ok: false, errors: [{ path: "$", message: "Context must be a JSON object." }] };
  }
  const record = cleaned as Record<string, unknown>;
  const warnings = strippedPaths.map(
    (item) => `${item} was removed. Private or account fields cannot be sent to ATLAS Explain.`,
  );

  if (record.v !== undefined || record.kind !== undefined || record.card !== undefined) {
    return parseEnvelope(record, source, warnings);
  }
  return parseBareCard(record, source, warnings);
}

export function parseContextHash(hash: string): { ok: true; value: ParsedContextLink } | { ok: false; errors: FieldError[] } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.trim().length === 0) {
    return { ok: true, value: { warnings: [] } };
  }
  if (raw.length > MAX_CONTEXT_CHARS * 2) {
    return { ok: false, errors: [{ path: "hash", message: "That link is too large to load." }] };
  }

  const params = new URLSearchParams(raw);
  const conceptId = readConcept(params.get("concept"));
  const encoded = params.get("c") ?? params.get("card");
  if (!encoded) {
    return { ok: true, value: { conceptId, warnings: [] } };
  }

  const decoded = decodePayload(encoded);
  if (!decoded.ok) return decoded;
  const parsed = parseExplainContext(decoded.value, "deep_link");
  if (!parsed.ok) return parsed;
  if (conceptId && !parsed.value.conceptId) parsed.value.conceptId = conceptId;
  if (conceptId && parsed.value.context && !parsed.value.context.concepts?.includes(conceptId)) {
    parsed.value.context.concepts = [...(parsed.value.context.concepts ?? []), conceptId];
  }
  return parsed;
}

export function serializeContextHash(context: ExplainContextV1): string {
  const payload = contextToPublicJson(context);
  const json = JSON.stringify(payload);
  return `#c=${toBase64Url(json)}`;
}

export function buildExplainUrl(base: string, context: ExplainContextV1, conceptId?: string): string {
  const root = base.replace(/\/$/, "");
  let hash = serializeContextHash(context);
  if (conceptId && isGlossaryId(conceptId)) {
    hash += `&concept=${encodeURIComponent(conceptId)}`;
  }
  return `${root}/${hash}`;
}

export function contextToPublicJson(context: ExplainContextV1): Record<string, unknown> {
  const card = publicMoveCard(context.card);
  const payload: Record<string, unknown> = {
    v: CONTEXT_VERSION,
    kind: "move_card",
    card: moveCardJson(card),
  };
  if (context.source) payload.source = context.source;
  if (context.question) payload.question = context.question;
  if (context.concepts && context.concepts.length > 0) payload.concepts = context.concepts;
  return payload;
}

function parseEnvelope(
  record: Record<string, unknown>,
  source: ContextSource,
  warnings: string[],
): { ok: true; value: ParsedContextLink } | { ok: false; errors: FieldError[] } {
  if (record.v !== CONTEXT_VERSION) {
    return { ok: false, errors: [{ path: "v", message: "Only context version 1 is supported." }] };
  }
  if (record.kind !== "move_card") {
    return { ok: false, errors: [{ path: "kind", message: 'kind must be "move_card".' }] };
  }
  const cardResult = validateMoveCard(record.card);
  if (!cardResult.ok) return cardResult;
  const card = publicMoveCard(cardResult.card);
  if (cardResult.card.notes || cardResult.card.watchlist.length > 0) {
    warnings.push("Notes and watchlist were removed from the inbound card.");
  }
  const question = readQuestion(record.question);
  if (question && "error" in question) return { ok: false, errors: [question.error] };
  const concepts = readConcepts(record.concepts, warnings);
  const resolvedSource = readSource(record.source, source);
  const context: ExplainContextV1 = {
    v: 1,
    kind: "move_card",
    source: resolvedSource,
    card,
    concepts,
  };
  if (question && "value" in question) context.question = question.value;
  const conceptId = concepts[0];
  return { ok: true, value: { context, conceptId, warnings } };
}

function parseBareCard(
  record: Record<string, unknown>,
  source: ContextSource,
  warnings: string[],
): { ok: true; value: ParsedContextLink } | { ok: false; errors: FieldError[] } {
  const cardResult = validateMoveCard(record);
  if (!cardResult.ok) return cardResult;
  const card = publicMoveCard(cardResult.card);
  if (cardResult.card.notes || cardResult.card.watchlist.length > 0) {
    warnings.push("Notes and watchlist were removed from the inbound card.");
  }
  return {
    ok: true,
    value: {
      context: { v: 1, kind: "move_card", source, card, concepts: [] },
      warnings,
    },
  };
}

function readQuestion(value: unknown): { value: string } | { error: FieldError } | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    return { error: { path: "question", message: "question must be text." } };
  }
  const trimmed = value.trim();
  if (trimmed.length > 600) {
    return { error: { path: "question", message: "Question must be 600 characters or fewer." } };
  }
  return trimmed.length > 0 ? { value: trimmed } : undefined;
}

function readConcepts(value: unknown, warnings: string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push("concepts was ignored because it was not a list.");
    return [];
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isGlossaryId(item)) {
      warnings.push(`Unknown concept "${String(item)}" was ignored.`);
      continue;
    }
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}

function readSource(value: unknown, fallback: ContextSource): ContextSource {
  if (typeof value === "string" && SOURCE_IDS.has(value as ContextSource)) {
    return value as ContextSource;
  }
  return fallback;
}

function readConcept(value: string | null): string | undefined {
  if (!value) return undefined;
  const id = value.trim();
  return isGlossaryId(id) ? id : undefined;
}

function decodePayload(encoded: string): { ok: true; value: unknown } | { ok: false; errors: FieldError[] } {
  const trimmed = encoded.trim();
  if (trimmed.length > MAX_CONTEXT_CHARS * 2) {
    return { ok: false, errors: [{ path: "hash", message: "That link is too large to load." }] };
  }
  let text: string;
  try {
    if (looksLikeBase64Url(trimmed)) {
      text = fromBase64Url(trimmed);
    } else {
      text = decodeURIComponent(trimmed);
    }
  } catch {
    return { ok: false, errors: [{ path: "hash", message: "That link could not be decoded." }] };
  }
  if (text.length > MAX_CONTEXT_CHARS) {
    return { ok: false, errors: [{ path: "hash", message: "That link is too large to load." }] };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, errors: [{ path: "hash", message: "That link is not valid JSON." }] };
  }
}

function looksLikeBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length % 4 !== 1;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = globalThis.btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function moveCardJson(card: MoveCard): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbol: card.symbol,
    movePct: card.movePct,
    peerMoves: card.peerMoves,
    upcomingEvents: card.upcomingEvents,
    headlines: card.headlines,
  };
  if (card.asOf) payload.asOf = card.asOf;
  if (card.volumeVsNormal !== undefined) payload.volumeVsNormal = card.volumeVsNormal;
  if (card.marketLabel) payload.marketLabel = card.marketLabel;
  if (card.marketMovePct !== undefined) payload.marketMovePct = card.marketMovePct;
  if (card.sector) payload.sector = card.sector;
  if (card.sectorMovePct !== undefined) payload.sectorMovePct = card.sectorMovePct;
  if (card.volatilityNote) payload.volatilityNote = card.volatilityNote;
  if (card.document) payload.document = card.document;
  if (card.sourceNote) payload.sourceNote = card.sourceNote;
  return payload;
}
