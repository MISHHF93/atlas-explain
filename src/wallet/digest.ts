import { NOT_READY, longTorontoDate, todayToronto, type DigestView } from "../core/digest";
import { el } from "./dom";

export function digestCard(): { node: HTMLElement; show: (view: DigestView) => void } {
  const node = el("section", "daily-digest");
  node.setAttribute("aria-label", "Today's brief");
  function show(view: DigestView): void {
    const today = "today" in view ? view.today : view.kind === "ready" ? view.digest.reportingDate : todayToronto();
    const head = el("div", "digest-head");
    head.append(el("h2", undefined, "Today's brief"), el("span", "fine", `${longTorontoDate()} · America/Toronto`));
    const body = el("div", "digest-body");
    if (view.kind === "loading") {
      body.append(el("p", "fine", "Loading today's digest…"));
    } else if (view.kind === "not_connected" || view.kind === "not_ready") {
      const p = el("p", "digest-not-ready", view.reason);
      p.dataset.testid = "digest-not-ready";
      body.append(p);
      if (view.kind === "not_ready" && view.digest) {
        body.append(el("p", "fine", `Previous digest dated ${view.digest.reportingDate} (${view.digest.timezone}) is not shown as today.`));
      }
    } else {
      const d = view.digest;
      body.append(el("p", "digest-headline", d.headline));
      body.append(el("p", "fine", `Dated ${d.reportingDate} (${d.timezone}), generated ${d.generatedAtToronto}. Today is ${today}.`));
      if (d.reason) body.append(el("p", "fine", d.reason));
      if (d.officialNotes.length) {
        const ul = el("ul", "digest-notes");
        for (const n of d.officialNotes) {
          const li = el("li");
          const a = el("a", undefined, n.title) as HTMLAnchorElement;
          a.href = n.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          li.append(a, el("span", "fine", ` · ${n.source} · ${n.publishedAtToronto}`));
          ul.append(li);
        }
        body.append(ul);
      } else {
        body.append(el("p", "fine", "No official notes for today yet."));
      }
      if (d.previousOfficialNotes[0]) {
        const prev = d.previousOfficialNotes[0];
        body.append(el("p", "fine", `Most recent earlier official note: ${prev.publishedDate} (${d.timezone}) — not today.`));
      }
      if (d.morningReport && !d.morningReport.isToday) {
        body.append(el("p", "fine", `The ATLAS morning report on file is ${d.morningReport.reportDate} (${d.timezone}), not today.`));
      }
      body.append(el("p", "fine", d.disclaimer));
    }
    node.replaceChildren(head, body);
  }
  show({ kind: "loading" });
  return { node, show };
}
