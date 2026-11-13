import { longTorontoDate, todayToronto, type DigestView } from "../core/digest";
import { el } from "./dom";

export function earlierOfficialNoteCopy(date: string, timezone: string): string {
  return `An earlier official note from ${date} (${timezone}) is on file. It is not today's note.`;
}

export function staleMorningReportCopy(date: string, timezone: string): string {
  return `The last ATLAS morning report is dated ${date} (${timezone}). It is not today's report, so it is not shown as today's brief.`;
}

export function digestCard(): { node: HTMLElement; show: (view: DigestView) => void } {
  const node = el("section", "daily-digest");
  node.setAttribute("aria-label", "Today's brief");
  function show(view: DigestView): void {
    const today = "today" in view ? view.today : view.kind === "ready" ? view.digest.reportingDate : todayToronto();
    const head = el("div", "digest-head");
    const status = el("span", "digest-status", view.kind === "ready" ? "Today" : view.kind === "loading" ? "Loading" : "Not ready yet");
    status.dataset.status = view.kind === "ready" ? "ready" : view.kind === "loading" ? "loading" : "waiting";
    head.append(el("h2", undefined, "Today's brief"), status, el("span", "fine digest-date", `${longTorontoDate()} - America/Toronto`));
    const body = el("div", "digest-body");
    // Only a ready brief gets the full card. Loading and not-ready collapse to one line so the
    // question box stays above the fold; the honest reason is one tap away.
    node.dataset.compact = view.kind === "ready" ? "false" : "true";
    if (view.kind === "loading") {
      body.append(el("p", "fine", "Loading today's digest..."));
    } else if (view.kind === "not_connected" || view.kind === "not_ready") {
      const more = el("details", "digest-more");
      const summary = el("summary");
      summary.append(el("span", undefined, "Why it is not ready"));
      const p = el("p", "digest-not-ready", view.reason);
      p.dataset.testid = "digest-not-ready";
      more.append(summary, el("p", "fine digest-date-inline", `${longTorontoDate()} - America/Toronto`), p);
      if (view.kind === "not_ready" && view.digest) {
        more.append(el("p", "fine", `Previous digest dated ${view.digest.reportingDate} (${view.digest.timezone}) is not shown as today.`));
      }
      body.append(more);
    } else {
      const d = view.digest;
      body.append(el("p", "digest-headline", d.headline));
      body.append(el("p", "fine", `Dated ${d.reportingDate} (${d.timezone}), generated ${d.generatedAtToronto}. Today is ${today}.`));
      const hasStructuredStale = Boolean(d.previousOfficialNotes[0] || (d.morningReport && !d.morningReport.isToday) || !d.officialNotes.length);
      if (d.reason && !hasStructuredStale) body.append(el("p", "fine", d.reason));
      if (d.officialNotes.length) {
        const ul = el("ul", "digest-notes");
        for (const n of d.officialNotes) {
          const li = el("li");
          const a = el("a", undefined, n.title) as HTMLAnchorElement;
          a.href = n.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          li.append(a, el("span", "fine", ` - ${n.source} - ${n.publishedAtToronto}`));
          ul.append(li);
        }
        body.append(ul);
      } else {
        body.append(el("p", "fine", "No official notes for today yet."));
      }
      if (d.previousOfficialNotes[0]) {
        const prev = d.previousOfficialNotes[0];
        body.append(el("p", "fine", earlierOfficialNoteCopy(prev.publishedDate, d.timezone)));
      }
      if (d.morningReport && !d.morningReport.isToday) {
        body.append(el("p", "fine", staleMorningReportCopy(d.morningReport.reportDate, d.timezone)));
      }
      body.append(el("p", "fine", d.disclaimer));
    }
    node.replaceChildren(head, body);
  }
  show({ kind: "loading" });
  return { node, show };
}
