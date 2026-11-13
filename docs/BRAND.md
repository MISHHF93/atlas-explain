# ATLAS Explain brand

The identity is shared by the web app and the Chrome extension. Colour and type come from `src/brand/tokens.css`. Components use those variables. Do not add a new hex colour in CSS.

## Mark

`src/brand/logo.svg` is the mark: a teal rounded square with a soft diagonal gradient, an off-white peak that reads as an **A**, and a small teal signal dot at the top right. The dot is the signal light in miniature. The wordmark is **ATLAS** in small caps tracking, with **Explain** in the serif face. The web header, the favicon, and the extension popup all use this lockup. `public/logo.svg`, `public/favicon.svg`, and `extension/public/logo.svg` are copies of the same file.

Extension icons at 16, 32, 48, and 128 are rasterised from the same geometry by `node scripts/write-extension-icons.mjs` (pure Node, supersampled, with thicker strokes at 16px and 32px so the peak stays legible).

## Icons

`extension/src/icons.ts` is the icon set: a 24px grid, a 1.75 stroke, round caps and joins, and `currentColor`. Each signal state has its own glyph (up arrow, down arrow, flat line, or plug for "connect ATLAS"), so the state never depends on colour alone.

## Popup

The popup is a 360px wallet-style menu that drops down from the toolbar at the top right, from the top-right corner, in 260ms.

1. **Bar.** Logo lockup, a connection pill (ATLAS desk, Not connected, or Offline), and Settings.
2. **Signal card.** The orb, the headline (Connect ATLAS, Not enough evidence, Model leans up, or Model leans down), chips for hit rate, sample, and the evidence gate, the paper line, a three-colour legend, and a "Why this colour?" disclosure. While an explanation is on screen, the card folds into a compact row.
3. **Ask.** A term box, **Explain highlight**, and **Explain text** (Ctrl/Cmd+Enter).
4. **Result.** Empty, loading (three steps: read, on-device, cloud, with a skeleton), answer (with an on-device or cloud chip, the quoted highlight, Copy, and Clear), limit, error (with Retry), and offline.
5. **Footer.** The privacy line, the disclaimer, and the beta badge.

Settings slide in from the right: appearance (System, Light, or Dark), page tools, the App Check debug token, the plan line (free during beta, billing built in and switched off), privacy, and the version and licence.

Motion: grey breathes slowly, green and red ripple, and a state change pops the orb once. Every animation is turned off under `prefers-reduced-motion: reduce`. Focus is a 3px accent ring. No text is smaller than 11px (`--atlas-text-2xs`).

Preview without Chrome: build the extension, serve `extension/dist`, and open `popup.html?signal=grey|thin|green|red&demo=answer|loading|error|offline&theme=light|dark&view=settings&why=open`. The preview data is labelled as a sample and never reaches a real tab.

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

Dark mode follows `prefers-color-scheme`. The popup also has a Light/Dark control that sets `data-theme` on the document.

## Signal light

Green means "model leans up". Red means "model leans down". Grey means "not enough evidence", or "connect ATLAS" when the desk tab is not open. The line under the light is always: Paper prediction from ATLAS shadow models - not investment advice. The light never says buy or sell.

## Chrome Web Store

`npm run build:extension` produces `extension/atlas-explain-chrome.zip`. Screenshots for the listing are the popup at 360×560 in the three signal states. Use the grey "connect ATLAS" frame as the primary image. Green and red frames are the widget states for a model that has cleared the evidence gate. Shipped models have not cleared it, so the live default is grey.
