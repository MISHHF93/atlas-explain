/**
 * Small diagrams for glossary terms that are easier to see than to read. They show the idea
 * with labels only: no prices or figures, so nothing in them can be mistaken for market data.
 * Colours come from the theme (currentColor and tokens), so they work in light and dark.
 */
import { el } from "./dom";

const DIAGRAMS: Readonly<Record<string, { alt: string; svg: string }>> = {
  spread: {
    alt: "Diagram: on a price line, the highest price a buyer offers (the bid) sits below the lowest price a seller asks (the ask). The gap between them is the spread.",
    svg: `<svg viewBox="0 0 300 96" width="100%" height="96" aria-hidden="true" focusable="false">
      <line x1="16" y1="56" x2="284" y2="56" class="dg-axis"/>
      <text x="16" y="88" class="dg-note">lower price</text><text x="284" y="88" text-anchor="end" class="dg-note">higher price</text>
      <circle cx="110" cy="56" r="6" class="dg-up"/><text x="110" y="36" text-anchor="middle" class="dg-label">Bid</text>
      <text x="110" y="76" text-anchor="middle" class="dg-note">best buyer</text>
      <circle cx="190" cy="56" r="6" class="dg-down"/><text x="190" y="36" text-anchor="middle" class="dg-label">Ask</text>
      <text x="190" y="76" text-anchor="middle" class="dg-note">best seller</text>
      <path d="M118 18 H182" class="dg-brace"/><text x="150" y="14" text-anchor="middle" class="dg-label">Spread</text>
    </svg>`,
  },
  stop_limit: {
    alt: "Diagram: as the price falls it first reaches the stop price, which turns the order on; the limit price, a little further on, is the worst price the order will accept. Past the limit, the order can wait unfilled.",
    svg: `<svg viewBox="0 0 300 128" width="100%" height="128" aria-hidden="true" focusable="false">
      <path d="M16 14 C 70 16, 90 24, 120 40 S 190 72, 250 84" class="dg-line"/>
      <line x1="16" y1="40" x2="284" y2="40" class="dg-stop"/><text x="284" y="34" text-anchor="end" class="dg-label">Stop</text>
      <line x1="16" y1="62" x2="284" y2="62" class="dg-limit"/><text x="284" y="56" text-anchor="end" class="dg-label">Limit</text>
      <text x="16" y="106" class="dg-note">Stop: the order turns on. Limit: the worst price it accepts.</text>
      <text x="16" y="122" class="dg-note">Past the limit, the order waits and may not fill.</text>
    </svg>`,
  },
  yield_curve: {
    alt: "Diagram: a normal yield curve rises from short-term to long-term bonds; an inverted curve falls, with short-term yields above long-term ones.",
    svg: `<svg viewBox="0 0 300 104" width="100%" height="104" aria-hidden="true" focusable="false">
      <line x1="24" y1="84" x2="284" y2="84" class="dg-axis"/><line x1="24" y1="10" x2="24" y2="84" class="dg-axis"/>
      <text x="24" y="100" class="dg-note">short term</text><text x="284" y="100" text-anchor="end" class="dg-note">long term</text>
      <path d="M30 70 C 90 46, 170 34, 280 28" class="dg-up dg-curve"/><text x="280" y="22" text-anchor="end" class="dg-label">Normal: rises</text>
      <path d="M30 34 C 90 50, 170 60, 280 66" class="dg-down dg-curve"/><text x="280" y="78" text-anchor="end" class="dg-label">Inverted: falls</text>
    </svg>`,
  },
};

export function hasDiagram(termId: string): boolean {
  return termId in DIAGRAMS;
}

/** The diagram for a term, as an image with a full text alternative; null when the term has none. */
export function termDiagram(termId: string): HTMLElement | null {
  const d = DIAGRAMS[termId];
  if (!d) return null;
  const figure = el("figure", "term-diagram");
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-label", d.alt);
  const holder = document.createElement("div");
  holder.innerHTML = d.svg;
  figure.append(holder.firstElementChild as Element);
  return figure;
}
