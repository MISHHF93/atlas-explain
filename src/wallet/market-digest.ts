import { MIN_SAMPLE_SIZE } from "../core/signal";
import { breadthLine, pct, type MarketDigestView, type Mover } from "../core/market-digest";
import { el } from "./dom";

/** Grounded market digest card: what changed, biggest moves with track record, evidence, gaps. */
export function marketDigestCard(view: MarketDigestView): HTMLElement {
  const node = el("section", "market-digest");
  node.setAttribute("aria-label", "Today's markets from ATLAS");
  node.dataset.kind = view.kind;
  if (view.kind !== "ready") {
    const p = el("p", "md-empty", view.reason);
    p.dataset.testid = "market-digest-empty";
    node.append(el("h2", "md-title", "Markets today"), p);
    return node;
  }

  const changed = el("div", "md-block");
  changed.append(el("h2", "md-title", "What changed"));
  const classes = el("ul", "md-classes");
  for (const c of view.classes) {
    const li = el("li");
    li.append(el("span", "md-class", c.label), el("span", "md-breadth", breadthLine(c)), el("span", "md-src", `${c.sourceLabel} · ${c.asOfLine}`));
    if (c.counted < c.total) li.append(el("span", "md-src", `${c.total - c.counted} of ${c.total} left out: no fresh quote.`));
    classes.append(li);
  }
  changed.append(classes);

  const moves = el("div", "md-block");
  moves.append(el("h3", "md-sub", "Biggest moves, either way"));
  const list = el("ul", "md-movers");
  for (const m of view.movers) list.append(moverItem(m));
  moves.append(list);

  const evidence = el("div", "md-block");
  evidence.append(el("h3", "md-sub", "ATLAS evidence"), el("p", "md-line", view.evidence.line));
  if (view.evidence.stillNeeded.length) {
    const ul = el("ul", "md-needed");
    for (const n of view.evidence.stillNeeded) ul.append(el("li", undefined, n));
    evidence.append(el("p", "md-src", `Before any light turns on, ATLAS still needs:`), ul);
  }

  const gaps = el("details", "md-gaps");
  const summary = el("summary");
  summary.append(el("span", undefined, `Not connected yet (${view.notConnected.length})`));
  const gl = el("ul");
  for (const g of view.notConnected) {
    const li = el("li");
    li.append(el("strong", undefined, g.title), el("span", "md-src", ` ${g.source}. ${g.why}`));
    gl.append(li);
  }
  gaps.append(summary, gl);

  const how = el("p", "md-how");
  how.append(el("strong", undefined, "How we know. "), document.createTextNode(view.howWeKnow));
  node.append(changed, moves, evidence, gaps, how);
  if (view.stockCitation) node.append(el("p", "md-cite", view.stockCitation));
  return node;
}

function moverItem(m: Mover): HTMLElement {
  const li = el("li", "md-mover");
  li.dataset.colour = m.record.colour;
  const top = el("div", "md-mover-top");
  const name = el("span", "md-sym");
  name.append(el("strong", undefined, m.symbol), el("span", "md-name", ` ${m.name}`));
  const change = el("span", "md-chg", pct(m.changePct));
  change.dataset.dir = m.changePct > 0 ? "up" : m.changePct < 0 ? "down" : "flat";
  top.append(name, change);
  const record = el("div", "md-record");
  const meter = el("span", "md-meter");
  meter.setAttribute("role", "img");
  const n = m.record.sampleSize ?? 0;
  meter.setAttribute("aria-label", `${n} of ${MIN_SAMPLE_SIZE} resolved paper calls`);
  const fill = el("span", "md-meter-fill");
  fill.style.width = `${Math.min(100, Math.round((n / MIN_SAMPLE_SIZE) * 100))}%`;
  meter.append(fill);
  record.append(el("span", "md-dot"), el("span", "md-record-line", `${m.record.horizonLabel}: ${m.record.line}`), meter);
  li.append(top, el("span", "md-src", m.window), record, el("span", "md-how-line", m.howWeKnow));
  return li;
}
