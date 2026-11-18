/**
 * The view treasury_auctions draws inside the chat (an MCP App; frame and bridge in ./app-shell): the auctions
 * announced, then recent results as bars of the yield each sold at, with its bid-to-cover ratio. From
 * TreasuryDirect; describes auctions held or announced, never a forecast.
 */
import { appPage, EXPAND_BUTTON } from "./app-shell";

export const AUCTIONS_APP_URI = "ui://atlas-explain/treasury-auctions.html";

export const AUCTIONS_APP_HTML = appPage({
  name: "atlas-explain-treasury-auctions",
  title: "ATLAS Explain: Treasury auctions",
  css: `
  .label { margin: 14px 0 0; font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 600; color: var(--muted); padding: 4px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 5px 6px; border-bottom: 1px solid var(--line); }
  td.r, th.r { text-align: right; }
  .yb { display: grid; grid-template-columns: minmax(110px, 32%) 1fr auto; align-items: center; gap: 8px; font-size: 12px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
  .yb:hover, .yb:focus-visible { background: var(--soft); outline: none; }
  .yb .track { height: 12px; position: relative; }
  .yb .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); opacity: .75; border-radius: 3px; }
  .yb .val { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .yb .btc { color: var(--muted); }`,
  body: `  <header>
    <div><h1>US Treasury auctions</h1><p class="sub" id="sub"></p></div>
    ${EXPAND_BUTTON}
  </header>
  <div id="plot"><div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line short"></div></div></div>
  <div class="readout" id="readout" aria-live="polite"></div>
  <div class="asks" id="asks"></div>`,
  footer: "Auctions held or announced, never a forecast.",
  script: `
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const bn = (v) => v == null ? "" : "$" + (v / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "B";
  const name = (a) => a.term + " " + a.type.toLowerCase();
  function onResult(d) {
    if (!d || (!Array.isArray(d.upcoming) && !Array.isArray(d.recent))) { message("Nothing to show right now."); return; }
    const up = d.upcoming || [], recent = (d.recent || []).filter((a) => a.yieldPct != null);
    $("sub").textContent = up.length + " announced, " + recent.length + " recent results.";
    const parts = [];
    if (up.length) {
      parts.push(el("p", "label", "Announced"));
      const t = el("table"); const head = el("tr");
      for (const [h, r] of [["Auction date", 0], ["Security", 0], ["Offering", 1]]) { const th = el("th", r ? "r" : "", h); th.scope = "col"; head.append(th); }
      t.append(head);
      for (const a of up) { const tr = el("tr"); tr.append(el("td", "", day(a.auctionDate)), el("td", "", name(a)), el("td", "r", bn(a.offeringUsd))); t.append(tr); }
      parts.push(t);
    }
    if (recent.length) {
      parts.push(el("p", "label", "Recent results: the yield each sold at"));
      const hi = Math.max(...recent.map((a) => a.yieldPct));
      const box = el("div");
      for (const a of recent) {
        const row = el("div", "yb"); row.tabIndex = 0;
        const track = el("span", "track"), fill = el("span", "fill");
        fill.style.width = Math.max(2, (a.yieldPct / hi) * 100) + "%"; track.append(fill);
        const v = el("span", "val", a.yieldPct.toFixed(3) + "% ");
        if (a.bidToCover != null) v.append(el("span", "btc", "bid-to-cover " + a.bidToCover.toFixed(2)));
        row.append(el("span", "", name(a) + ", " + day(a.auctionDate)), track, v);
        const read = () => { $("readout").textContent = name(a) + " sold " + day(a.auctionDate) + ": " + bn(a.offeringUsd) + " at " + a.yieldPct.toFixed(3) + "%" + (a.bidToCover != null ? ", bids worth " + a.bidToCover.toFixed(2) + " times the amount offered" : "") + (a.indirectPct != null ? ", " + a.indirectPct.toFixed(1) + "% to indirect bidders" : "") + "."; };
        row.addEventListener("mouseenter", read); row.addEventListener("focus", read);
        row.addEventListener("click", () => { read(); tellClaude("The user picked the " + name(a) + " auction of " + a.auctionDate + " in the ATLAS Explain auctions view: yield " + a.yieldPct + "%, bid-to-cover " + a.bidToCover + "."); });
        box.append(row);
      }
      parts.push(box);
    }
    $("plot").replaceChildren(...parts);
    $("source").textContent = d.source ? "Source: " + d.source + "." : "";
    askButtons($("asks"), [
      { label: "What's bid-to-cover?", prompt: "Using ATLAS Explain, explain what a Treasury auction's yield and bid-to-cover ratio mean, using the latest results from treasury_auctions as examples. Plain language, no forecast." },
      { label: "Bills vs notes vs bonds", prompt: "Using ATLAS Explain, explain the difference between Treasury bills, notes and bonds, with the auctions from treasury_auctions as examples. Plain language, no forecast." },
    ]);
    reportSize();
  }
`,
});
