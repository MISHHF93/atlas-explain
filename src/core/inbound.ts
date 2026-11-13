import { parseExplainContext, type ParsedContextLink } from "./context-link";
import { isGlossaryId } from "./glossary";
import type { FieldError } from "./types";

export const EXPLAIN_LOAD_MESSAGE = "atlas-explain/v1/load";
export const EXPLAIN_LOADED_MESSAGE = "atlas-explain/v1/loaded";
export const EXPLAIN_ERROR_MESSAGE = "atlas-explain/v1/error";

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://atlas-explain.web.app",
  "https://atlas-explain.firebaseapp.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

export interface InboundMessage {
  type: string;
  payload?: unknown;
  concept?: unknown;
}

export function isAllowedOrigin(
  origin: string,
  allowlist: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): boolean {
  return allowlist.includes(origin);
}

export function readInboundMessage(
  data: unknown,
  origin: string,
  allowlist: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
):
  | { ok: true; value: ParsedContextLink }
  | { ok: false; errors: FieldError[] } {
  if (!isAllowedOrigin(origin, allowlist)) {
    return {
      ok: false,
      errors: [{ path: "origin", message: "That origin is not allowed to load a card into ATLAS Explain." }],
    };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: [{ path: "$", message: "Message must be an object." }] };
  }
  const record = data as InboundMessage;
  if (record.type !== EXPLAIN_LOAD_MESSAGE) {
    return { ok: false, errors: [{ path: "type", message: "Unsupported message type." }] };
  }

  const conceptId =
    typeof record.concept === "string" && isGlossaryId(record.concept) ? record.concept : undefined;

  if (record.payload === undefined || record.payload === null) {
    return { ok: true, value: { conceptId, warnings: [] } };
  }

  const parsed = parseExplainContext(record.payload, "post_message");
  if (!parsed.ok) return parsed;
  if (conceptId && !parsed.value.conceptId) parsed.value.conceptId = conceptId;
  if (conceptId && parsed.value.context && !parsed.value.context.concepts?.includes(conceptId)) {
    parsed.value.context.concepts = [...(parsed.value.context.concepts ?? []), conceptId];
  }
  return parsed;
}

export function inboundReply(
  result: { ok: true; value: ParsedContextLink } | { ok: false; errors: FieldError[] },
): { type: string; warnings?: string[]; errors?: FieldError[] } {
  if (result.ok) {
    return { type: EXPLAIN_LOADED_MESSAGE, warnings: result.value.warnings };
  }
  return { type: EXPLAIN_ERROR_MESSAGE, errors: result.errors };
}
