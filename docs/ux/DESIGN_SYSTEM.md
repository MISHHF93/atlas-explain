# ATLAS Explain design system

One set of tokens and components is shared by the website, the web app (`/app`) and the Chrome extension's popup and side panel. The rules below are enforced by `test/design-system.test.ts`, so a change that breaks them fails `npm run release:check`.

## Principles

- **Calm and plain.** One idea per card, short sentences, no decoration that carries meaning on its own.
- **Honest states.** Loading, empty, error, offline and "not shown" are designed states, each saying what happened and what to do next.
- **Source next to every number.** A figure never appears without its source and time.
- **Accessible by default.** WCAG AA contrast, full keyboard use, reduced motion respected, and no text below 11px.

## Tokens (`src/brand/tokens.css`)

Component CSS uses tokens only: no raw font sizes, radii or colours (enforced).

| Group | Tokens |
|---|---|
| Colour | `--atlas-ink`, `--atlas-muted`, `--atlas-paper`, `--atlas-card`, `--atlas-line`, `--atlas-accent`, `--atlas-accent-ink`, `--atlas-device`, `--atlas-cloud`, `--atlas-warn`, `--atlas-warn-ink`, `--atlas-signal-up` / `-down` / `-flat` |
| Type | `--atlas-text-2xs` 11 · `xs` 12 · `sm` 13 · `md` 14 (body) · `base` 16 · `lg` 18 · `xl` 22 · `2xl` 28 · `3xl` 32 px. Serif (`--atlas-font-serif`) for titles and hero numbers, sans for everything else |
| Space | `--atlas-space-1` 4 · `space-2` 8 · `space` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 px |
| Radius | `--atlas-radius-xs` 4 · `sm` 8 · `radius` 12 · `lg` 16 · `xl` 20 · `2xl` 28 · `pill` |
| Elevation and motion | `--atlas-shadow-sm` / `md` / `lg`, `--atlas-dur-fast` / `dur` / `dur-slow`, `--atlas-ease` / `ease-out` |

### Colour and contrast

Light and dark themes define the same tokens. Dark applies from the system setting or the manual switch, and the two dark blocks must stay identical (enforced).

| Pair | Light | Dark |
|---|---|---|
| ink on paper / card | 15.5 / 17.2 | 15.5 / 13.3 |
| muted on paper / card | 6.4 / 7.2 | 9.7 / 8.4 |
| accent on card (links) | 6.3 | 6.5 |
| accent-ink on accent (primary button) | 6.4 | 7.2 |
| signal-up / signal-down on card | 5.2 / 7.4 | 6.5 / 5.2 |

Every text pair is at least 4.5:1 (enforced). `--atlas-signal-flat` is for dots, lights and lines only, where 3:1 is the bar (3.8 and 5.3).

Up and down are never shown by colour alone: changes carry a sign (+ / −) and, where there is room, an arrow.

## Components (`src/wallet/wallet.css`, built in `src/wallet/*.ts`)

| Component | Class | Use |
|---|---|---|
| Card | `.card` | The basic surface. One topic per card. |
| Group | `.card.group` + `h3` | Settings and page sections ("Official figures", "About forex"). |
| Section label | `.section-label` | Small uppercase heading above a list (shared by the app and the popup). |
| Primary button | `.primary` | One per view: the main action ("Explain", "Explain this asset"). |
| Secondary button | `.secondary` | Other actions ("Add to watchlist", "Try again"). |
| Link button | `.link-btn` | Low-emphasis inline actions ("Clear", "Remove"). |
| Icon button | `.icon-btn` | Icon-only actions; always has an `aria-label`. |
| Row | `.row-btn` | A full-width navigation row in settings and "Next". |
| Chip | `.chip`, `.follow-chip` | Examples, follow-ups and related terms. |
| Filter | `.filter` + `aria-pressed` | Class filters and glossary groups. |
| Badge | `.fresh-badge[data-fresh]`, `.class-tag` | Live · Daily · Reference · Delayed; the asset class. |
| Asset row | `.asset-row` in `.asset-list` | Catalog rows: icon or logo, name, symbol, badges, value and change. |
| Message states | `.state-empty`, `.state-loading`, `.state-error`, `.state-offline`, `.state-limit` | Built with `messageCard()` / `emptyCard()` / `loadingCard()`: a title, one plain line, and a retry where one helps. |
| Notice | `.notice-line` | A one-line warning inside a working view ("Crypto prices couldn't be loaded right now"). |
| Sheet | `.sheet` | Asset pages, account, terms: slides in, Escape and Back close it, focus returns. |
| Disclosure | `.disclosure` | Secondary detail, closed by default. |

## Writing

- Say what happened and what to do next, in one or two short sentences.
- No internal names: no SDK, config, model ids, localhost or build terms in user copy (enforced in `test/public-surface.test.ts` and `test/web-wallet.test.ts`).
- Education only: never buy or sell wording (`npm run check:trade-words`).

## Motion

Transitions use the duration and easing tokens. Every animation has a `prefers-reduced-motion: reduce` override, and smooth scrolling switches to instant under it.

## Checking a CSS change is visually neutral

1. `node scripts/dev/dedupe-css.mjs src/wallet/wallet.css` removes declarations that a later rule with the identical selector always overrides (dead code).
2. Build (`npm run build`). Then, with Chrome running headless on a debugging port, run `node scripts/dev/style-diff.mjs <port> <page URL> dist/assets/app-*.css [width]` against a deployed preview of the previous version. It swaps the stylesheet in place and compares the computed style of every element; "0 computed-style differences" means nothing changed on screen. A deliberate change (a negative control) reports differences, which confirms the tool works.
