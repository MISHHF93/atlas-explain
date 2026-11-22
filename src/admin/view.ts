/**
 * The owner dashboard's content, drawn from one /admin/overview answer. Plain DOM, no framework.
 */
import type { Overview } from "../mcp/admin";

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmt = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const age = (m: number | null) => (m == null ? "never" : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`);
const every = (m: number) => (m < 60 ? `every ${m} min` : m < 1440 ? `every ${m / 60} h` : `every ${m / 1440} day${m === 1440 ? "" : "s"}`);

function card(title: string, ...body: Node[]): HTMLElement {
  const c = h("section", "ad-card");
  c.append(h("h2", "ad-card-title", title), ...body);
  return c;
}

function table(head: string[], rows: (string | Node)[][], empty: string): HTMLElement {
  if (!rows.length) return h("p", "ad-fine", empty);
  const wrap = h("div", "ad-table-wrap");
  const t = h("table", "ad-table");
  const tr = h("tr");
  for (const x of head) tr.append(Object.assign(h("th", undefined, x), { scope: "col" }));
  t.append(tr);
  for (const r of rows) {
    const row = h("tr");
    r.forEach((cell, i) => {
      const td = i === 0 ? Object.assign(h("th"), { scope: "row" }) : h("td");
      td.append(cell);
      row.append(td);
    });
    t.append(row);
  }
  wrap.append(t);
  return wrap;
}

function tile(label: string, value: string, note?: string): HTMLElement {
  const t = h("div", "ad-tile");
  t.append(h("span", "ad-tile-label", label), h("strong", "ad-tile-value", value));
  if (note) t.append(h("span", "ad-fine", note));
  return t;
}

function pill(text: string, tone: "ok" | "warn" | "off"): HTMLElement {
  return h("span", `ad-pill ad-pill-${tone}`, text);
}

function chart(o: Overview): HTMLElement {
  const days = o.usage!.days;
  const max = Math.max(1, ...days.map((d) => d.calls));
  const bars = h("div", "ad-bars");
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", `Tool calls per day, ${day(days[0]!.day)} to ${day(days.at(-1)!.day)}; the busiest day had ${fmt(max)}.`);
  for (const d of days) {
    const b = h("span", d.errors ? "ad-bar ad-bar-err" : "ad-bar");
    b.style.height = `${d.calls ? Math.max(3, Math.round((d.calls / max) * 100)) : 1}%`;
    b.title = `${day(d.day)}: ${fmt(d.calls)} calls, ${fmt(d.errors)} errors, ${fmt(d.connects)} connections`;
    bars.append(b);
  }
  const axis = h("div", "ad-axis");
  axis.append(h("span", undefined, day(days[0]!.day)), h("span", undefined, `peak ${fmt(max)}`), h("span", undefined, day(days.at(-1)!.day)));
  const box = h("div");
  box.append(bars, axis);
  return box;
}

function share(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "";
}

export function renderOverview(o: Overview, on: { days: number; onDays: (d: number) => void; onRefresh: () => void; onSignOut: () => void }): HTMLElement {
  const page = h("div", "ad-page");

  // Title row: what this is, who is signed in, the range and refresh.
  const top = h("div", "ad-top");
  const title = h("div");
  title.append(h("h1", "ad-title", "Owner dashboard"), h("p", "ad-fine", `Signed in as ${o.owner} · updated ${when(o.generatedAt)}`));
  const controls = h("div", "ad-actions");
  const range = h("div", "ad-seg");
  range.setAttribute("role", "group");
  range.setAttribute("aria-label", "Range");
  for (const d of [7, 30, 90]) {
    const b = h("button", "ad-seg-btn", `${d} days`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(d === on.days));
    b.addEventListener("click", () => on.onDays(d));
    range.append(b);
  }
  const refresh = h("button", "ad-btn", "Refresh");
  refresh.type = "button";
  refresh.addEventListener("click", on.onRefresh);
  const out = h("button", "ad-btn", "Sign out");
  out.type = "button";
  out.addEventListener("click", on.onSignOut);
  controls.append(range, refresh, out);
  top.append(title, controls);
  page.append(top);

  // Connector usage.
  const u = o.usage;
  if (!u) {
    page.append(card("Connector usage", h("p", "ad-fine", o.usageError ?? "No counts yet.")));
  } else {
    const today = u.days.at(-1);
    const last7 = u.days.slice(-7).reduce((a, d) => a + d.calls, 0);
    const tiles = h("div", "ad-tiles");
    tiles.append(
      tile("Calls today", fmt(today?.calls ?? 0), "UTC day"),
      tile("Last 7 days", fmt(last7)),
      tile(`Last ${u.days.length} days`, fmt(u.totals.calls)),
      tile("Connections", fmt(u.totals.connects), "assistants that connected"),
      tile("Errors", fmt(u.totals.errors), u.totals.calls ? `${((u.totals.errors / u.totals.calls) * 100).toFixed(1)}% of calls` : undefined),
    );
    page.append(
      card("Connector usage", tiles, chart(o), h("p", "ad-fine", `${u.since ? `Counting since ${day(u.since)}.` : "Nothing counted yet."} Only counts are kept: no questions, answers or addresses.`)),
    );
    const grid = h("div", "ad-grid");
    grid.append(
      card("By tool", table(["Tool", "Calls", "Share", "Errors"], u.tools.map((t) => [t.name, fmt(t.calls), share(t.calls, u.totals.calls), t.errors ? fmt(t.errors) : "—"]), "No tool calls yet.")),
      card("By assistant", table(["Assistant", "Calls", "Share"], u.agents.map((a) => [a.name, fmt(a.calls), share(a.calls, u.totals.calls)]), "No calls yet."), h("p", "ad-fine", "From the name each assistant's software sends.")),
      card("Connections", table(["Name the assistant gave", "Connections"], u.clients.map((c) => [c.name, fmt(c.connects)]), "No connections yet.")),
    );
    page.append(grid);
  }

  // Live data freshness.
  const late = o.data.filter((d) => d.late).length;
  page.append(
    card(
      "Live data",
      h("p", "ad-fine", late ? `${late} of ${o.data.length} files are behind schedule.` : "Every file is on schedule."),
      table(["File", "Last updated", "Schedule", "Status"], o.data.map((d) => [d.file, d.capturedAt ? `${age(d.ageMinutes)} (${when(d.capturedAt)})` : "never", d.savedOnChange ? `checked ${every(d.expectedEveryMinutes)}, saved when new` : every(d.expectedEveryMinutes), d.late ? pill("Late", "warn") : pill("On time", "ok")]), "No data files."),
    ),
  );

  // Partner keys.
  page.append(
    card(
      "Partner API keys",
      table(["Partner", "Tier", "Today", "Last 7 days", "Daily limit", "Status"], o.partners.map((p) => [p.name, p.tier, fmt(p.today), fmt(p.last7Days), fmt(p.dailyLimit), p.active ? pill("Active", "ok") : pill("Off", "off")]), "No partner keys issued yet. Issue one with scripts/partners/issue-key.mjs."),
    ),
  );

  // Service settings and where to look further.
  const s = o.service;
  const facts = h("ul", "ad-facts");
  for (const [k, v] of [
    ["Connector version", s.version],
    ["Tools served", `${s.tools.length}`],
    ["Usage counting", s.counting ? "On" : "Off"],
    ["Partner credits", s.creditsEnabled ? "On" : "Off"],
  ] as const) {
    const li = h("li");
    li.append(h("span", "ad-fine", k), h("strong", undefined, v));
    facts.append(li);
  }
  const links = h("ul", "ad-links");
  for (const [label, href, why] of [
    ["Cloudflare: Workers metrics", "https://dash.cloudflare.com/?to=/:account/workers/services/view/atlas-explain-mcp/production/metrics", "All requests since launch, CPU and errors"],
    ["Firebase: users", "https://console.firebase.google.com/project/atlas-explain/authentication/users", "Web-app sign-ups and last sign-in"],
    ["Firebase: hosting", "https://console.firebase.google.com/project/atlas-explain/hosting/sites", "Website requests and bandwidth"],
    ["GitHub: traffic", "https://github.com/MISHHF93/atlas-explain/graphs/traffic", "Visitors to the code, last 14 days"],
    ["MCP Registry listing", "https://registry.modelcontextprotocol.io/v0/servers?search=atlas-explain", "The published connector versions"],
  ] as const) {
    const li = h("li");
    const a = h("a", undefined, label);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    li.append(a, h("span", "ad-fine", ` ${why}`));
    links.append(li);
  }
  const grid2 = h("div", "ad-grid");
  grid2.append(card("Service", facts, h("p", "ad-fine", s.tools.join(", "))), card("More numbers elsewhere", links));
  page.append(grid2);
  return page;
}
