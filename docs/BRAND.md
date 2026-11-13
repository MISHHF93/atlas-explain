# ATLAS Explain brand

The identity is shared by the web app and the Chrome extension. Colour and type come from `src/brand/tokens.css`. Components use those variables. Do not add a new hex colour in CSS.

## Mark

`src/brand/logo.svg` is the mark: a teal rounded square with a soft diagonal gradient, an off-white peak that reads as an **A**, and a small teal signal dot at the top right. The dot is the signal light in miniature. The wordmark is **ATLAS** in small caps tracking, with **Explain** in the serif face. The web header, the favicon, and the extension popup all use this lockup. `public/logo.svg`, `public/favicon.svg`, and `extension/public/logo.svg` are copies of the same file.

Extension icons at 16, 32, 48, and 128 are rasterised from the same geometry by `node scripts/write-extension-icons.mjs` (pure Node, supersampled, with thicker strokes at 16px and 32px so the peak stays legible).

## Icons

`extension/src/icons.ts` is the icon set: a 24px grid, a 1.75 stroke, round caps and joins, and `currentColor`. Each signal state has its own glyph (up arrow, down arrow, flat line, or plug for "connect ATLAS"), so the state never depends on colour alone.

## Wallet layout

The extension popup and the hosted web app share one wallet shell (`src/wallet/`): a fixed 360×600 frame that drops down from the toolbar like a crypto-wallet menu.

1. **Header.** Logo lockup, a status pill with the signal light (ATLAS desk, Not connected, or Offline; tapping it opens Signal), and a kebab menu (help, Glossary, open ATLAS desk, Terms, Privacy).
2. **Tabs.** A bottom tab bar with a sliding indicator: **Explain**, **Signal**, **Glossary**, **Settings**. Arrow keys move between tabs.
3. **Cards.** Compact wallet cards: explanation (on-device or cloud chip, Copy, Clear), signal light (orb, hit rate, sample, gate chips, "Why this colour?"), glossary term rows with search and group filters, plan (free during beta, billing built in and switched off), and empty, loading (three steps with a skeleton), error (with Retry), offline, and limit states.
4. **Footer.** One line: Educational information, not investment advice.
5. **Onboarding.** Three slides on first run (what it does, the signal light, privacy). Skippable and shown once.

Sheets (Terms, Privacy, load-unpacked steps, a glossary term) slide up over the frame. Motion uses `--atlas-ease` and `--atlas-dur`; grey breathes slowly, green and red ripple. Every animation is off under `prefers-reduced-motion: reduce`. Focus is a 3px accent ring. No text is smaller than 11px (`--atlas-text-2xs`). Colours come from `src/brand/tokens.css` only.

**Web.** atlas-explain.web.app centres the same frame on a soft stage, like an extension preview, and goes full-bleed at 420px and below. There is no separate full-page layout.

Preview without Chrome: build, serve `extension/dist` (or `dist` for the web), and open `popup.html` (or `/`) with `tab=explain|signal|glossary|settings`, `signal=grey|thin|green|red`, `demo=answer|loading|error|offline|limit` (web: `run|loading|error`), `why=open`, `menu=open`, `term=open`, `onboarding=1`, `theme=light|dark`, or on web `sheet=terms|extension`. Preview data is labelled as a sample and never reaches a real tab.

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

`npm run build:extension` produces `extension/atlas-explain-chrome.zip`. Screenshots for the listing are the popup at 360×600 in the three signal states. Use the grey "connect ATLAS" frame as the primary image. Green and red frames are the widget states for a model that has cleared the evidence gate. Shipped models have not cleared it, so the live default is grey.
