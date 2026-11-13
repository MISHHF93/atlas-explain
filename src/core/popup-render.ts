import { BETA_BADGE } from "./billing";
import { EXTENSION_DISCLAIMER, EXTENSION_PRIVACY_NOTE } from "./extension-prompt";
import { type SignalView, signalText } from "./signal";

export interface PopupModel {
  signal: SignalView;
  theme: "light" | "dark";
  answer?: string;
  pathLabel?: string;
}

/** Markup for the wallet popup. Colours come from token classes, not hex values. */
export function renderPopupHtml(model: PopupModel): string {
  const signal = model.signal;
  const answer = model.answer
    ? `<section class="answer">${escapeHtml(model.answer)}</section>`
    : "";
  return `<article class="popup" data-theme="${model.theme}">
  <header class="top">
    <p class="mark">ATLAS</p>
    <h1>Explain</h1>
    <p class="badge">${escapeHtml(BETA_BADGE)}</p>
  </header>
  <section class="signal" data-colour="${signal.colour}" role="status" aria-label="${escapeHtml(signalText(signal))}">
    <span class="signal-light" data-state="${signal.colour}"></span>
    <p class="signal-reason">${escapeHtml(signal.reason)}</p>
    <p class="signal-meta">${escapeHtml(signal.hitRateLabel)} · ${escapeHtml(signal.sampleLabel)}</p>
    <p class="signal-paper">${escapeHtml(signal.paperLabel)}</p>
  </section>
  <button type="button" id="why-colour">Why this colour?</button>
  <p class="privacy">${escapeHtml(EXTENSION_PRIVACY_NOTE)}</p>
  ${answer}
  <p class="disclaimer">${escapeHtml(EXTENSION_DISCLAIMER)}</p>
</article>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
