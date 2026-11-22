/**
 * The owner's "Connector usage" card in the account sheet (docs/ADMIN.md). It asks the connector for the
 * counts with the signed-in account's Firebase token; the connector decides who may see them. For anyone
 * else the answer is "not allowed" and the card never appears, so nothing here names the owner.
 */
import { MCP_ORIGIN } from "../core/links";
import type { UsageSummary } from "../mcp/stats";
import { el } from "./dom";

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function list(title: string, rows: [string, string][]): HTMLElement {
  const box = el("div", "admin-list");
  box.append(el("h3", "admin-sub", title));
  if (!rows.length) {
    box.append(el("p", "fine", "None yet."));
    return box;
  }
  const t = el("table", "econ-table");
  for (const [k, v] of rows) {
    const tr = el("tr");
    tr.append(Object.assign(el("th", undefined, k), { scope: "row" }), el("td", undefined, v));
    t.append(tr);
  }
  box.append(t);
  return box;
}

/** Calls per day as bars, newest on the right, each with its numbers for screen readers and on hover. */
function chart(s: UsageSummary): HTMLElement {
  const max = Math.max(1, ...s.days.map((d) => d.calls));
  const bars = el("div", "admin-bars");
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", `Tool calls per day over the last ${s.days.length} days, from ${fmt(Math.min(...s.days.map((d) => d.calls)))} to ${fmt(max)}.`);
  for (const d of s.days) {
    const b = el("span", "admin-bar");
    b.style.height = `${Math.max(2, Math.round((d.calls / max) * 100))}%`;
    b.title = `${day(d.day)}: ${fmt(d.calls)} calls, ${fmt(d.errors)} errors, ${fmt(d.connects)} new connections`;
    if (d.errors) b.classList.add("has-errors");
    bars.append(b);
  }
  const axis = el("p", "fine admin-axis");
  axis.append(el("span", undefined, day(s.days[0]!.day)), el("span", undefined, day(s.days.at(-1)!.day)));
  const wrap = el("div");
  wrap.append(bars, axis);
  return wrap;
}

export function usageCard(s: UsageSummary): HTMLElement {
  const c = el("section", "card econ-card admin-card");
  c.setAttribute("aria-labelledby", "admin-usage-title");
  const h = el("h2", "card-title", "Connector usage");
  h.id = "admin-usage-title";
  const today = s.days.at(-1);
  c.append(
    h,
    el("p", "fine", "Only you see this. Counts only: no questions, answers or addresses are kept."),
    el("p", "admin-total", `${fmt(s.totals.calls)} tool calls in the last ${s.days.length} days · ${fmt(today?.calls ?? 0)} today · ${fmt(s.totals.connects)} new connections · ${fmt(s.totals.errors)} errors`),
    chart(s),
    list("By tool", s.tools.map((t) => [t.name, t.errors ? `${fmt(t.calls)} (${fmt(t.errors)} errors)` : fmt(t.calls)])),
    list("By assistant", s.agents.map((a) => [a.name, fmt(a.calls)])),
    list("Connections, by the name the assistant gives", s.clients.map((x) => [x.name, fmt(x.connects)])),
    el("p", "fine", `${s.since ? `Counting since ${day(s.since)}.` : "Nothing counted yet."} Days are in UTC. Web-app sign-ups are in the Firebase console, under Authentication; total connector traffic since launch is in the Cloudflare dashboard, under Workers.`),
  );
  return c;
}

/** Fills `slot` with the card when the connector says this account may see it; otherwise leaves it empty. */
export async function mountAdminUsage(slot: HTMLElement, idToken: () => Promise<string | null>, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const token = await idToken();
    if (!token) return;
    const r = await fetcher(`${MCP_ORIGIN}/admin/stats?days=30`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const s = (await r.json()) as UsageSummary;
    if (!Array.isArray(s.days) || !s.days.length) return;
    slot.replaceChildren(usageCard(s));
  } catch {
    /* not the owner, offline, or counting not set up: no card */
  }
}
