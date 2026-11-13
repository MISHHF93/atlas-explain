# ATLAS Explain on the Chrome Web Store

Everything needed to list the extension. The owner registers the developer account and pays the one-time US$5 fee; nothing here creates accounts or spends money.

- Upload file: `extension/atlas-explain-chrome.zip` (built by `npm run build:extension`; the build strips the manifest `key`, which the store rejects).
- Listing images: `store/` (regenerate with `store/src/generate.mjs`, see the header of that file).
- Privacy policy URL: **https://atlas-explain.web.app/privacy**
- Website / support: https://atlas-explain.web.app · https://atlas-explain.web.app/support

## 1. Store listing tab

| Field | Value |
|---|---|
| Name | ATLAS Explain |
| Summary (≤132 chars) | Select any market term on a page and get a plain-language, two-sided explanation. On-device Gemini Nano first. Education only. |
| Category | Education (Productivity → Education) |
| Language | English |
| Official URL | https://atlas-explain.web.app |
| Homepage URL | https://atlas-explain.web.app |
| Support URL | https://atlas-explain.web.app/support |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee (1400×560) | `store/promo-marquee-1400x560.png` |
| Screenshots (1280×800, up to 5) | `store/screenshot-1-explain-1280x800.png`, `-2-highlight-`, `-3-sidepanel-`, `-4-learn-`, `-5-privacy-` (640×400 versions are alongside if preferred) |
| Store icon (128×128) | `extension/public/icons/icon-128.png` |

**Description**

```
Market jargon in plain language, right where you read.

Highlight a term or a sentence on any page – a news story, a chart, a filing – and ATLAS Explain gives you a calm, plain-language explanation with two sides: what some read as opportunity, what others read as risk, and what would change the picture. Then ask for it simpler, with an example, or why it matters.

ON YOUR DEVICE FIRST
ATLAS Explain uses Gemini Nano inside Chrome when your computer supports it, so the text never leaves your device. When on-device AI is not available, Gemini answers in the cloud through Firebase AI Logic, protected by App Check. Every answer says which one ran.

PRIVATE BY DESIGN
• Reads only the text you select, the page title and the site name – and only when you ask.
• Never reads balances, account numbers, positions or form fields, on any site.
• Recent explanations stay in your browser. Sign-in is optional.

HONEST BY DEFAULT
• Education only. It never tells anyone to trade.
• No made-up numbers: missing data stays missing, with the reason.
• Live crypto prices name their source. Research "leans" stay grey and say "withheld" until a model has earned the right to show one.

HOW TO USE
• Highlight text and click the ATLAS Explain icon, press Alt+Shift+X, or right-click → Explain with ATLAS.
• Open the side panel to keep explanations beside the page.
• Learn tab: a plain-language glossary and a short learn path.

Free during the beta. Open source (Apache-2.0): github.com/MISHHF93/atlas-explain

Educational information, not investment advice.
```

## 2. Privacy practices tab

**Single purpose**

> ATLAS Explain explains trading and market terms that the user selects on a web page, in plain language, for education.

**Permission justifications**

| Permission | Justification (paste into the form) |
|---|---|
| `activeTab` | Gives temporary access to the tab where the user clicked the icon, pressed the shortcut or used the context menu, so the extension can read the text the user highlighted. No access to other tabs. |
| `scripting` | Used with activeTab to run a one-off function in the current tab that returns the user's highlighted text, page title and site name; to read the public signal from the user's own ATLAS desk tab; and, only when the user asks, to add an on-page Explain button. No content scripts run in the background. |
| `contextMenus` | Adds one "Explain with ATLAS" item to the right-click menu for selected text. |
| `storage` | Saves recent explanations, theme and learn-path progress in local storage on the device, and hands the selected text from the context menu to the popup through session storage. Nothing is uploaded. |
| `sidePanel` (optional) | Requested only when the user clicks "Open side panel", to show the same explanations beside the page. |
| Host `http://localhost:3000/*` | Reads public prices and paper research statistics from the ATLAS desk app running on the user's own computer, only while the popup is open. Nothing from that read leaves the computer. If ATLAS is not running, nothing happens. |
| Host `https://atlas-explain.web.app/*` | Our own website. A hidden page there runs cloud explanations behind Firebase App Check (which needs a web origin) and shares the user's optional sign-in. It only accepts this extension's id and a fixed prompt. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package (no CDN scripts, no `eval`, CSP `script-src 'self'; object-src 'self'; base-uri 'none'`). The extension embeds a page from its own website in a hidden frame for cloud answers; that page is web content, not extension code.

**Data usage** (tick these and only these)

| Category | Collected? | Notes |
|---|---|---|
| Personally identifiable information | Yes, only if the user signs in | Email address and display name from Google or an email link, shown in the account chip. Sign-in is optional. |
| Website content | Yes | The text the user highlights, the page title and the site name, sent to Gemini only when the user asks for an explanation and on-device AI is unavailable. |
| Health information | No | |
| Financial and payment information | No | Never reads balances, account numbers or positions. Paid plans are switched off. |
| Authentication information | No | Passwords are never handled; sign-in happens on Google's or Firebase's pages. |
| Personal communications | No | |
| Location | No | |
| Web history | No | Only the current page's title and site name, at the user's request, as part of website content. |
| User activity | No | |

Certify all three: not sold or transferred to third parties outside the approved use cases; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

## 3. Distribution tab

- Visibility: Public (or Unlisted for a soft launch).
- Regions: all regions, or start with Canada and the United States.
- Pricing: free.

## 4. Test instructions for the reviewer

```
No account is needed. Open https://atlas-explain.web.app/demo/trading-terms.html, highlight "stop-limit order", then click the ATLAS Explain toolbar icon (or press Alt+Shift+X) and press Explain. If Gemini Nano is not available on the review machine, the answer comes from the cloud and is labelled "Cloud". Optional: Settings → Open side panel. The Assets tab shows live crypto prices with the provider named; "Connect ATLAS" refers to an optional desktop app on localhost:3000 and is expected to be unavailable.
```

## 5. Submission steps (owner)

1. Register at https://chrome.google.com/webstore/devconsole with the Google account that should own the listing; pay the one-time US$5 fee and verify the contact email.
2. On the laptop: `cd C:\Users\borah\atlas-explain`, `git pull`, `npm run release:check`. This rebuilds `extension\atlas-explain-chrome.zip`.
3. Developer console → **New item** → upload `extension\atlas-explain-chrome.zip`. The draft gets its **item id** now (32 letters, shown in the URL and on the item page).
4. **Send me that item id before submitting.** The store id differs from the unpacked id `ppobolmelmhmaofinpcihihlnhokiomm`, and cloud answers only work for allowlisted ids. I will add it to `ALLOWED_EXTENSION_IDS` (`src/bridge/protocol.ts`) and `frame-ancestors` (`firebase.json`) and redeploy; you add it in Google Cloud → Security → reCAPTCHA → the ATLAS Explain key → Domains.
5. Fill the Store listing, Privacy practices and Distribution tabs from sections 1–3, and paste the test instructions from section 4.
6. Make sure the privacy policy and terms are final (remove the Draft labels once reviewed; see `docs/LAUNCH_CHECKLIST.md` item 11).
7. **Submit for review.** Review usually takes from a few days to a few weeks.
8. When approved, send me the listing URL. I will point every **Add to Chrome** button on the website at it and change "coming soon" to the live listing.

## 6. Manifest audit (13 Nov 2026)

- Manifest V3, `service_worker` background, no `content_scripts`, no `web_accessible_resources`, no `externally_connectable`, no `<all_urls>`.
- Permissions are the four above plus optional `sidePanel`; `scripts/check-manifest.mjs` fails the release if any other permission or host appears, or if a declared API is never used.
- CSP `extension_pages`: `script-src 'self'; object-src 'self'; base-uri 'none'` (MV3-compliant; no remote, inline or eval script).
- Icons 16/32/48/128 PNG, declared for both `icons` and `action.default_icon`.
- No remote code: the build bundles everything; Firebase is not shipped in the extension (cloud calls go through the website's bridge page).
- Considered and not done yet: moving `http://localhost:3000/*` to `optional_host_permissions` and asking for it when the user connects ATLAS. That would remove one install-time warning but needs a permission prompt in the Assets tab. Worth doing if a reviewer asks.
