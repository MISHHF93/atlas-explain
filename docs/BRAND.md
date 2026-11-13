# ATLAS Explain brand

The identity is shared by the web app and the Chrome extension. Colour and type come from `src/brand/tokens.css`. Components use those variables. Do not add a new hex colour in CSS.

## Mark

`src/brand/logo.svg` is the mark: a teal rounded square and an off-white peak. The wordmark is **ATLAS** in small caps tracking, with **Explain** in the serif face. The web header and the extension popup both use this lockup.

Extension icons at 16, 32, 48, and 128 are generated from the same teal and paper colours by `node scripts/write-extension-icons.mjs`.

## Tokens

| Token | Light | Dark |
| --- | --- | --- |
| `--atlas-ink` | `#1c1915` | `#f4f1ea` |
| `--atlas-paper` | `#f4f1ea` | `#1c1915` |
| `--atlas-accent` | `#0c6b5e` | `#3dbea8` |
| `--atlas-signal-up` | `#1f7a4d` | `#3dbea8` |
| `--atlas-signal-down` | `#9b2c2c` | `#e07a72` |
| `--atlas-signal-flat` | `#8a8175` | `#a3988c` |

Type scale, none below 11px: `--atlas-text-xs` 12px, `--atlas-text-sm` 13px, `--atlas-text-md` 14px, `--atlas-text-lg` 1.35rem. Sans is Segoe UI. Serif is Georgia.

Dark mode follows `prefers-color-scheme`. The popup also has a Light/Dark control that sets `data-theme` on the document.

## Signal light

Green means "model leans up". Red means "model leans down". Grey means "not enough evidence", or "connect ATLAS" when the desk tab is not open. The line under the light is always: Paper prediction from ATLAS shadow models - not investment advice. The light never says buy or sell.

## Chrome Web Store

`npm run build:extension` produces `extension/atlas-explain-chrome.zip`. Screenshots for the listing are the popup at 360×560 in the three signal states. Use the grey "connect ATLAS" frame as the primary image. Green and red frames are the widget states for a model that has cleared the evidence gate. Shipped models have not cleared it, so the live default is grey.
