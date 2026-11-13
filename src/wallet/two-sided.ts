import { el } from "./dom";
import { icon } from "./icons";

/** The shared two-sided layout: summary, opportunity case, risk case, what would change. */
export function twoSidedNodes(answer: { summary: string; buyerReasons: readonly string[]; sellerReasons: readonly string[]; whatWouldChange: string }): Node[] {
  const nodes: Node[] = [el("p", "summary-line", answer.summary)];
  nodes.push(caseBlock("up", "Why a buyer might see opportunity", answer.buyerReasons, "case case-up"));
  nodes.push(caseBlock("down", "Why a seller might see risk", answer.sellerReasons, "case case-down"));
  if (answer.whatWouldChange) {
    const change = el("div", "case");
    const head = el("h3");
    head.append(icon("refresh", 14), el("span", undefined, "What would change the picture"));
    change.append(head, el("p", "fine strong", answer.whatWouldChange));
    nodes.push(change);
  }
  return nodes;
}

export function caseBlock(dir: "up" | "down", title: string, reasons: readonly string[], className = "case"): HTMLElement {
  const block = el("section", className);
  const head = el("h3");
  head.append(icon(dir, 14), el("span", undefined, title));
  const list = el("ol");
  for (const reason of reasons) list.append(el("li", undefined, reason));
  block.append(head, list);
  return block;
}
