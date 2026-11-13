import { digestRowStatus, type DigestView } from "../core/digest";
import { el } from "./dom";
import { icon } from "./icons";

/**
 * A single row on the Explain tab that opens today's grounded digest in a sheet,
 * instead of a full card competing with the question box.
 */
export function todayRow(onOpen: () => void): { node: HTMLButtonElement; show: (view: DigestView) => void } {
  const node = el("button", "today-row");
  node.type = "button";
  const title = el("span", "today-title");
  title.append(icon("doc", 16), el("span", undefined, "Today's digest"));
  const status = el("span", "digest-status");
  const chevron = icon("chevron", 14);
  node.append(title, status, chevron);
  node.addEventListener("click", onOpen);
  function show(view: DigestView): void {
    const s = digestRowStatus(view);
    status.textContent = s.label;
    status.dataset.status = s.tone;
    node.setAttribute("aria-label", `Open today's digest. ${s.label}.`);
  }
  show({ kind: "loading" });
  return { node, show };
}
