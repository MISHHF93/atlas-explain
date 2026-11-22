/**
 * Connector usage counts for the owner's admin view (docs/ADMIN.md): calls per day, per tool and per
 * assistant, and errors. Only counts are kept: never a question, an answer, an IP address or a raw
 * User-Agent. Stored in one SQLite-backed Durable Object (free on the Workers Free plan); if counting
 * fails, the call it was counting is unaffected.
 */

/** What one MCP request adds to the counts. */
export type CallEvent =
  | { kind: "tool"; tool: string; agent: string; error: boolean }
  | { kind: "connect"; client: string; agent: string };

/** Which assistant made the call, from its User-Agent, as one of a few broad names. Nothing else is kept. */
export function agentOf(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/claude|anthropic/i.test(ua)) return "Claude";
  if (/openai|chatgpt/i.test(ua)) return "ChatGPT";
  if (/cursor/i.test(ua)) return "Cursor";
  if (/vscode|visual studio code|copilot/i.test(ua)) return "VS Code";
  if (/gemini|google/i.test(ua)) return "Gemini";
  if (!ua) return "Unknown";
  return "Other";
}

/** The name an assistant gives itself when it connects, tidied to letters, digits and a few marks. */
export function clientLabel(name: unknown): string {
  if (typeof name !== "string") return "unnamed";
  const tidy = name.replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, 40);
  return tidy || "unnamed";
}

/** The count a request adds: a tool call (with its outcome) or a new connection. Anything else adds nothing. */
export function eventOf(
  message: { method?: string; params?: Record<string, unknown> },
  reply: { error?: unknown; result?: unknown } | null,
  userAgent: string | null,
): CallEvent | null {
  const agent = agentOf(userAgent);
  if (message.method === "tools/call" && typeof message.params?.name === "string") {
    const isError = !!reply?.error || (typeof reply?.result === "object" && reply.result !== null && (reply.result as { isError?: unknown }).isError === true);
    return { kind: "tool", tool: message.params.name.slice(0, 60), agent, error: isError };
  }
  if (message.method === "initialize") {
    const info = message.params?.clientInfo as { name?: unknown } | undefined;
    return { kind: "connect", client: clientLabel(info?.name), agent };
  }
  return null;
}

/** The counter rows one event adds to, for its UTC day. */
export function rowsFor(e: CallEvent): [kind: string, key: string][] {
  if (e.kind === "connect") return [["connects", "all"], ["client", e.client]];
  const rows: [string, string][] = [["calls", "all"], ["tool", e.tool], ["agent", e.agent]];
  if (e.error) rows.push(["errors", e.tool]);
  return rows;
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** Counts kept this long, then dropped. */
export const KEEP_DAYS = 400;

/** The part of Durable Object SQLite storage used here (also met by node:sqlite in tests). */
export interface SqlStorage {
  exec(query: string, ...bindings: (string | number)[]): { toArray(): Record<string, unknown>[] };
}

export interface UsageSummary {
  since: string | null;
  days: { day: string; calls: number; errors: number; connects: number }[];
  tools: { name: string; calls: number; errors: number }[];
  agents: { name: string; calls: number }[];
  clients: { name: string; connects: number }[];
  totals: { calls: number; errors: number; connects: number };
}

/** The counts themselves, on any SQLite storage. */
export class UsageCounts {
  constructor(private readonly sql: SqlStorage) {
    sql.exec("CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, kind, key))");
  }

  record(e: CallEvent, now: number): void {
    const day = utcDay(now);
    for (const [kind, key] of rowsFor(e)) {
      this.sql.exec("INSERT INTO counts (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, kind, key) DO UPDATE SET n = n + 1", day, kind, key);
    }
    // Once a day is enough to drop old counts; the first call of each day does it.
    const first = this.sql.exec("SELECT n FROM counts WHERE day = ? AND kind = ? AND key = ?", day, rowsFor(e)[0]![0], "all").toArray()[0];
    if (first && Number(first.n) === 1) this.sql.exec("DELETE FROM counts WHERE day < ?", utcDay(now - KEEP_DAYS * 86_400_000));
  }

  summary(days: number, now: number): UsageSummary {
    const from = utcDay(now - (days - 1) * 86_400_000);
    const rows = this.sql.exec("SELECT day, kind, key, n FROM counts WHERE day >= ? ORDER BY day", from).toArray() as { day: string; kind: string; key: string; n: number }[];
    const since = (this.sql.exec("SELECT MIN(day) AS d FROM counts").toArray()[0]?.d as string | null | undefined) ?? null;
    const byDay = new Map<string, { day: string; calls: number; errors: number; connects: number }>();
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= now; t += 86_400_000) byDay.set(utcDay(t), { day: utcDay(t), calls: 0, errors: 0, connects: 0 });
    const tools = new Map<string, { name: string; calls: number; errors: number }>();
    const agents = new Map<string, number>();
    const clients = new Map<string, number>();
    const totals = { calls: 0, errors: 0, connects: 0 };
    for (const r of rows) {
      const n = Number(r.n);
      const d = byDay.get(r.day);
      if (r.kind === "calls") {
        if (d) d.calls += n;
        totals.calls += n;
      } else if (r.kind === "connects") {
        if (d) d.connects += n;
        totals.connects += n;
      } else if (r.kind === "errors") {
        if (d) d.errors += n;
        totals.errors += n;
        const t = tools.get(r.key) ?? { name: r.key, calls: 0, errors: 0 };
        t.errors += n;
        tools.set(r.key, t);
      } else if (r.kind === "tool") {
        const t = tools.get(r.key) ?? { name: r.key, calls: 0, errors: 0 };
        t.calls += n;
        tools.set(r.key, t);
      } else if (r.kind === "agent") agents.set(r.key, (agents.get(r.key) ?? 0) + n);
      else if (r.kind === "client") clients.set(r.key, (clients.get(r.key) ?? 0) + n);
    }
    const desc = <T>(m: Map<string, number>, f: (k: string, n: number) => T) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => f(k, n));
    return {
      since,
      days: [...byDay.values()],
      tools: [...tools.values()].sort((a, b) => b.calls - a.calls),
      agents: desc(agents, (name, calls) => ({ name, calls })),
      clients: desc(clients, (name, connects) => ({ name, connects })),
      totals,
    };
  }
}

/**
 * The Durable Object (wrangler.toml binding STATS, class UsageStats). One instance, "global", holds every
 * count. POST /record adds an event; GET /summary?days=N reads them back. Reachable only through this
 * Worker's binding, never from the internet.
 */
export class UsageStats {
  private readonly counts: UsageCounts;
  constructor(state: { storage: { sql: SqlStorage } }) {
    this.counts = new UsageCounts(state.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/record") {
      this.counts.record((await request.json()) as CallEvent, Date.now());
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && url.pathname === "/summary") {
      const days = Math.min(KEEP_DAYS, Math.max(1, Number(url.searchParams.get("days")) || 30));
      return Response.json(this.counts.summary(days, Date.now()));
    }
    return new Response("Not found", { status: 404 });
  }
}

/** The Worker's view of the binding. */
export interface StatsNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

const stub = (ns: StatsNamespace) => ns.get(ns.idFromName("global"));

/** Adds an event. Never throws: a count that can't be written is simply lost. */
export async function recordEvent(ns: StatsNamespace, e: CallEvent): Promise<void> {
  try {
    await stub(ns).fetch("https://stats/record", { method: "POST", body: JSON.stringify(e) });
  } catch {
    /* counting is best effort */
  }
}

export async function readSummary(ns: StatsNamespace, days: number): Promise<UsageSummary> {
  const r = await stub(ns).fetch(`https://stats/summary?days=${days}`);
  if (!r.ok) throw new Error(`stats ${r.status}`);
  return (await r.json()) as UsageSummary;
}
