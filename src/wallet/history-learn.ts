import { relativeTime, type HistoryEntry } from "../core/history";
import { sourceChip } from "./cards";
import { el, iconButton } from "./dom";
import { icon } from "./icons";

/** Recent explanations kept on this device. Tapping one reopens it without a new model call. */
export function historyCard(options: {
  entries: readonly HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onClear: () => void;
  /** Remove one entry. The row gets a small remove button when this is given. */
  onRemove?: (entry: HistoryEntry) => void;
  limit?: number;
  /** Where Recent is kept, in one line. Defaults to this device only. */
  note?: string;
}): HTMLElement {
  const card = el("section", "card history");
  card.setAttribute("aria-label", "Recent explanations");
  const head = el("div", "card-head");
  const title = el("h3", "card-title");
  title.append(icon("history", 16), el("span", undefined, "Recent"));
  head.append(title);
  if (options.entries.length) {
    const clear = iconButton("close", "Clear recent explanations", "icon-btn ghost");
    clear.addEventListener("click", options.onClear);
    head.append(clear);
  }
  card.append(head);
  if (!options.entries.length) {
    card.append(el("p", "fine", "Your last explanations appear here. They stay on this device."));
    return card;
  }
  const list = el("ul", "history-list");
  for (const entry of options.entries.slice(0, options.limit ?? 5)) {
    const item = el("li");
    const open = el("button", "history-item");
    open.type = "button";
    open.setAttribute("aria-label", `Reopen the explanation of ${entry.selection}`);
    const meta = el("span", "history-meta");
    meta.append(sourceChip(entry.source), el("span", "fine", relativeTime(entry.at)));
    open.append(el("span", "history-text", entry.selection || "Typed question"), meta);
    open.addEventListener("click", () => options.onOpen(entry));
    item.append(open);
    if (options.onRemove) {
      const onRemove = options.onRemove;
      item.className = "history-row";
      const remove = iconButton("close", `Remove the explanation of ${entry.selection || "this question"}`, "icon-btn ghost");
      remove.addEventListener("click", () => onRemove(entry));
      item.append(remove);
    }
    list.append(item);
  }
  card.append(list, el("p", "fine", options.note ?? "Stored on this device only. Never uploaded."));
  return card;
}
