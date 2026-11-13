import type { FieldError, Headline, MoveCard, PeerMove } from "./types";

const SYMBOL = /^[A-Z0-9][A-Z0-9.]{0,11}$/;

export function isSymbol(value: string): boolean {
  return SYMBOL.test(value);
}

export function validateMoveCard(input: unknown): { ok: true; card: MoveCard } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: [{ path: "$", message: "Move card must be a JSON object." }] };
  }

  const record = input as Record<string, unknown>;
  const symbol = readSymbol(record.symbol, "symbol", errors);
  const movePct = readPercent(record.movePct, "movePct", errors, true);
  const asOf = readOptionalDate(record.asOf, "asOf", errors);
  const volumeVsNormal = readOptionalPositive(record.volumeVsNormal, "volumeVsNormal", errors, 100);
  const marketMovePct = readPercent(record.marketMovePct, "marketMovePct", errors, false);
  const sectorMovePct = readPercent(record.sectorMovePct, "sectorMovePct", errors, false);
  const marketLabel = readOptionalText(record.marketLabel, "marketLabel", errors, 80);
  const sector = readOptionalText(record.sector, "sector", errors, 80);
  const volatilityNote = readOptionalText(record.volatilityNote, "volatilityNote", errors, 400);
  const sourceNote = readOptionalText(record.sourceNote, "sourceNote", errors, 800);
  const document = readOptionalText(record.document, "document", errors, 20_000);
  const notes = readOptionalText(record.notes, "notes", errors, 2_000);
  const upcomingEvents = readStringList(record.upcomingEvents, "upcomingEvents", errors, 12, 240);
  const headlines = readHeadlines(record.headlines, errors);
  const peerMoves = readPeers(record.peerMoves, errors);
  const watchlist = readWatchlist(record.watchlist, errors);

  if (errors.length > 0 || !symbol || movePct === undefined) {
    return { ok: false, errors };
  }

  const card: MoveCard = {
    symbol,
    movePct,
    peerMoves,
    upcomingEvents,
    headlines,
    watchlist,
  };

  if (asOf) card.asOf = asOf;
  if (volumeVsNormal !== undefined) card.volumeVsNormal = volumeVsNormal;
  if (marketMovePct !== undefined) card.marketMovePct = marketMovePct;
  if (sectorMovePct !== undefined) card.sectorMovePct = sectorMovePct;
  if (marketLabel) card.marketLabel = marketLabel;
  if (sector) card.sector = sector;
  if (volatilityNote) card.volatilityNote = volatilityNote;
  if (sourceNote) card.sourceNote = sourceNote;
  if (document) card.document = document;
  if (notes) card.notes = notes;

  return { ok: true, card };
}

export function parseMoveCardJson(raw: string): { ok: true; card: MoveCard } | { ok: false; errors: FieldError[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: [{ path: "$", message: "That text is not valid JSON." }],
    };
  }
  return validateMoveCard(parsed);
}

export function hasPrivateContext(card: MoveCard): boolean {
  return Boolean(card.notes && card.notes.trim().length > 0) || card.watchlist.length > 0;
}

/**
 * Applies the dedicated private fields. Non-empty form fields win over JSON
 * so the user can see where private text lives.
 */
export function applyPrivateFields(
  card: MoveCard,
  notes: string,
  watchlistRaw: string,
): { card: MoveCard; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const next: MoveCard = { ...card, peerMoves: [...card.peerMoves], headlines: [...card.headlines], watchlist: [...card.watchlist], upcomingEvents: [...card.upcomingEvents] };
  const trimmedNotes = notes.trim();
  if (trimmedNotes.length > 2_000) {
    errors.push({ path: "notes", message: "Notes must be 2000 characters or fewer." });
  } else if (trimmedNotes.length > 0) {
    next.notes = trimmedNotes;
  }

  const fromField = watchlistRaw
    .split(/[\s,]+/)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);

  if (fromField.length > 0) {
    const watchlist: string[] = [];
    fromField.forEach((symbol, index) => {
      if (!isSymbol(symbol)) {
        errors.push({
          path: `watchlist[${index}]`,
          message: `"${symbol}" is not a symbol. Use letters, digits, and dots, up to 12 characters.`,
        });
        return;
      }
      if (!watchlist.includes(symbol)) watchlist.push(symbol);
    });
    if (watchlist.length > 50) {
      errors.push({ path: "watchlist", message: "Watchlist can hold at most 50 symbols." });
    } else {
      next.watchlist = watchlist;
    }
  }

  return { card: next, errors };
}

export function publicMoveCard(card: MoveCard): MoveCard {
  const next: MoveCard = { ...card, watchlist: [] };
  delete next.notes;
  return next;
}

export function moveCardForPrompt(card: MoveCard, includePrivateContext: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbol: card.symbol,
    movePct: card.movePct,
  };
  if (card.asOf) payload.asOf = card.asOf;
  if (card.volumeVsNormal !== undefined) payload.volumeVsNormal = card.volumeVsNormal;
  if (card.marketLabel) payload.marketLabel = card.marketLabel;
  if (card.marketMovePct !== undefined) payload.marketMovePct = card.marketMovePct;
  if (card.sector) payload.sector = card.sector;
  if (card.sectorMovePct !== undefined) payload.sectorMovePct = card.sectorMovePct;
  if (card.peerMoves.length > 0) payload.peerMoves = card.peerMoves;
  if (card.volatilityNote) payload.volatilityNote = card.volatilityNote;
  if (card.upcomingEvents.length > 0) payload.upcomingEvents = card.upcomingEvents;
  if (card.headlines.length > 0) payload.headlines = card.headlines;
  if (card.document) payload.document = card.document;
  if (card.sourceNote) payload.sourceNote = card.sourceNote;
  if (includePrivateContext) {
    if (card.notes) payload.notes = card.notes;
    if (card.watchlist.length > 0) payload.watchlist = card.watchlist;
  }
  return payload;
}

function readSymbol(value: unknown, path: string, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({ path, message: "Symbol is required." });
    return undefined;
  }
  const symbol = value.trim().toUpperCase();
  if (!isSymbol(symbol)) {
    errors.push({
      path,
      message: "Symbol must be 1–12 characters: letters, digits, and dots (for example NVDA or BRK.B).",
    });
    return undefined;
  }
  return symbol;
}

function readPercent(
  value: unknown,
  path: string,
  errors: FieldError[],
  required: boolean,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) {
      errors.push({
        path,
        message: "movePct is required and must be a number such as -6.2, without a percent sign.",
      });
    }
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ path, message: `${path} must be a finite number, without a percent sign.` });
    return undefined;
  }
  if (value < -100 || value > 1000) {
    errors.push({ path, message: `${path} must be between -100 and 1000.` });
    return undefined;
  }
  return value;
}

function readOptionalDate(value: unknown, path: string, errors: FieldError[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !isIsoDate(value.trim())) {
    errors.push({ path, message: "Date must be YYYY-MM-DD." });
    return undefined;
  }
  return value.trim();
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readOptionalPositive(
  value: unknown,
  path: string,
  errors: FieldError[],
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    errors.push({ path, message: `${path} must be a number greater than 0 and at most ${max}.` });
    return undefined;
  }
  return value;
}

function readOptionalText(
  value: unknown,
  path: string,
  errors: FieldError[],
  max: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    errors.push({ path, message: `${path} must be text.` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    errors.push({ path, message: `${path} must be ${max} characters or fewer.` });
    return undefined;
  }
  return trimmed;
}

function readStringList(
  value: unknown,
  path: string,
  errors: FieldError[],
  maxItems: number,
  maxLen: number,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, message: `${path} must be an array of strings.` });
    return [];
  }
  if (value.length > maxItems) {
    errors.push({ path, message: `${path} can contain at most ${maxItems} items.` });
  }
  const items: string[] = [];
  value.slice(0, maxItems).forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > maxLen) {
      errors.push({
        path: `${path}[${index}]`,
        message: `Each entry must be text, 1–${maxLen} characters.`,
      });
      return;
    }
    items.push(item.trim());
  });
  return items;
}

function readHeadlines(value: unknown, errors: FieldError[]): Headline[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ path: "headlines", message: "headlines must be an array." });
    return [];
  }
  if (value.length > 40) {
    errors.push({ path: "headlines", message: "A move card can include at most 40 headlines." });
  }
  const headlines: Headline[] = [];
  value.slice(0, 40).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ path: `headlines[${index}]`, message: "Each headline must be an object with text." });
      return;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.text !== "string" || record.text.trim().length === 0 || record.text.trim().length > 400) {
      errors.push({
        path: `headlines[${index}].text`,
        message: "Headline text is required and must be 400 characters or fewer.",
      });
      return;
    }
    const headline: Headline = { text: record.text.trim() };
    if (record.source !== undefined && record.source !== null && record.source !== "") {
      if (typeof record.source !== "string" || record.source.trim().length === 0 || record.source.trim().length > 80) {
        errors.push({
          path: `headlines[${index}].source`,
          message: "Headline source must be 80 characters or fewer.",
        });
        return;
      }
      headline.source = record.source.trim();
    }
    headlines.push(headline);
  });
  return headlines;
}

function readPeers(value: unknown, errors: FieldError[]): PeerMove[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ path: "peerMoves", message: "peerMoves must be an array." });
    return [];
  }
  if (value.length > 8) {
    errors.push({ path: "peerMoves", message: "peerMoves can contain at most 8 peers." });
  }
  const peers: PeerMove[] = [];
  value.slice(0, 8).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ path: `peerMoves[${index}]`, message: "Each peer must be an object with symbol and movePct." });
      return;
    }
    const record = item as Record<string, unknown>;
    const localErrors: FieldError[] = [];
    const symbol = readSymbol(record.symbol, `peerMoves[${index}].symbol`, localErrors);
    const movePct = readPercent(record.movePct, `peerMoves[${index}].movePct`, localErrors, true);
    errors.push(...localErrors);
    if (symbol && movePct !== undefined && localErrors.length === 0) {
      peers.push({ symbol, movePct });
    }
  });
  return peers;
}

function readWatchlist(value: unknown, errors: FieldError[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ path: "watchlist", message: "watchlist must be an array of symbols." });
    return [];
  }
  if (value.length > 50) {
    errors.push({ path: "watchlist", message: "Watchlist can hold at most 50 symbols." });
  }
  const watchlist: string[] = [];
  value.slice(0, 50).forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push({ path: `watchlist[${index}]`, message: "Watchlist entries must be symbols." });
      return;
    }
    const symbol = item.trim().toUpperCase();
    if (!isSymbol(symbol)) {
      errors.push({
        path: `watchlist[${index}]`,
        message: `"${item}" is not a symbol.`,
      });
      return;
    }
    if (!watchlist.includes(symbol)) watchlist.push(symbol);
  });
  return watchlist;
}
