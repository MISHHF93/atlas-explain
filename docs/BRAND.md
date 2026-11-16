# ATLAS Explain brand

The identity is shared by the website, the web app and the MCP connector's icons. Colour and type come from `src/brand/tokens.css`. Components use those variables. Do not add a new hex colour in CSS.

## Mark

`src/brand/logo.svg` is the mark: a teal rounded square with a soft diagonal gradient, an off-white peak that reads as an **A**, and a small teal signal dot at the top right. The dot is the signal light in miniature. The wordmark is **ATLAS** in small caps tracking, with **Explain** in the serif face. The website header, the app header and the favicon use this lockup. `public/logo.svg` and `public/favicon.svg` are copies of the same file. The connector's icons (`src/mcp/icon-data.ts`) are written from `public/app-icon.svg` by `node scripts/write-mcp-icons.mjs`.

## Icons

`src/wallet/icons.ts` is the icon set: a 24px grid, a 1.75 stroke, round caps and joins, and `currentColor`. Each signal state has its own glyph (up arrow, down arrow, flat line, or plug for "connect ATLAS"), so the state never depends on colour alone.

## App layout

The web app at `/app` is one scrolling page built from the wallet parts in `src/wallet/`: a header (logo with the "App" badge, links to Today, Learn and Assets, a status pill, Sign in or the account menu, and a menu), then Explain, Today, Learn and Assets. Cards cover the explanation (on-device or cloud chip, Copy, Clear), the signal light, glossary terms, the plan, and empty, loading, error, offline and limit states. One footer line: Educational information, not investment advice. First-run slides are skippable and shown once.

Sheets (Terms, Privacy, Account, a glossary term) slide up over the page. Motion uses `--atlas-ease` and `--atlas-dur`; grey breathes slowly, green and red ripple. Every animation is off under `prefers-reduced-motion: reduce`. Focus is a 3px accent ring. No text is smaller than 11px (`--atlas-text-2xs`). Colours come from `src/brand/tokens.css` only.

Development previews (`npm run dev`, then `/app`) accept `demo=answer|loading|error`, `onboarding=1`, `sheet=terms|confirm-email`, `account=preview` and `theme=light|dark`. Preview data is labelled as a sample and never ships.

## Tokens

| Token | Light | Dark |
| --- | --- | --- |
| `--atlas-ink` | `#1c1915` | `#f4f1ea` |
| `--atlas-paper` | `#f4f1ea` | `#1c1915` |
| `--atlas-accent` | `#0c6b5e` | `#3dbea8` |
| `--atlas-signal-up` | `#1f7a4d` | `#3dbea8` |
| `--atlas-signal-down` | `#9b2c2c` | `#e07a72` |
| `--atlas-signal-flat` | `#8a8175` | `#a3988c` |

Type scale, none below 11px: `--atlas-text-2xs` 11px, `--atlas-text-xs` 12px, `--atlas-text-sm` 13px, `--atlas-text-md` 14px, `--atlas-text-lg` 1.35rem. Sans is Segoe UI. Serif is Georgia.

Dark mode follows `prefers-color-scheme`. The app's Settings also has a Light/Dark control that sets `data-theme` on the document.

## Signal light

Green means "model leans up". Red means "model leans down". Grey means "not enough evidence", or "connect ATLAS" when the desk tab is not open. The line under the light is always: Paper prediction from ATLAS shadow models - not investment advice. The light never says buy or sell.

