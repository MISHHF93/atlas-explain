# ATLAS Explain: assets, engines and the grounded digest

Written 13 Nov 2026 against ATLAS `5279646` (the :3000 server was running on the owner's laptop) and ATLAS Explain `15ddd53`. Every number below comes from read-only GETs against that live server between 16:30 and 16:35 America/Toronto. Nothing in ATLAS was changed. Yoyo owns the ATLAS platform, so anything ATLAS needs to add is listed as a **request for Yoyo** at the end.

The rules don't change: education only (no buy/sell wording), no made-up numbers, no account data, and "not ready" instead of a guess.

## 1. Why ATLAS Explain, not a GPT digest

A chat model can write a fluent market summary for any day. It can't tell you where a number came from or how often its calls were right, and it never says "I don't know". ATLAS Explain is only worth opening if it does the things a general chatbot can't:

| | General chatbot digest | ATLAS Explain |
|---|---|---|
| **Grounding** | Training data plus whatever it browses. Numbers can't be traced. | ATLAS's own stores on your computer: Kraken 1m bars (live, 24/7) and IEX HIST daily closes (T+1). Each number has a source label and an `asOf` timestamp. |
| **Track record** | None. Every answer sounds equally confident. | Every ATLAS lean shows its sample count, its hit rate, and the gate it must clear (at least 200 resolved samples and 55%). Below that the light is **grey**, and it says which checks failed. |
| **Honesty about gaps** | It fills them in. | `price: null` means "No Kraken bars in the last 26 hours. Nothing is filled in." The digest says "not ready" until today's file exists. |
| **Personal** | A generic market wrap. | Per asset: the market you highlighted or opened, from the catalog on your machine. |
| **Privacy** | Your prompt goes to a vendor. | Gemini Nano on the device first; the cloud only if needed, and only for the highlighted text. It never reads balances, accounts or form fields. |
| **Provenance** | Rarely cited. | Every line has a "How we know" note naming the engine, source, time and gate behind it. |

The UI has to make that difference visible in one glance: **source · time · track record** sits next to every number, and grey and "not ready" are proper states with a reason, not errors.

## 2. ATLAS engine inventory (what could feed Explain)

"Public" means it's already read-only and allowed on the public MCP surface (`atlas.public` tools) or on the `/api/explain/*` routes, which strip account-shaped fields. "Desk only" means the route exists on :3000 but isn't part of the Explain/public contract yet.

| Engine / route | What it gives | Exposed for Explain? | Freshness (live check) | Honesty constraints | How it would show in Explain |
|---|---|---|---|---|---|
| **Asset catalog** `GET /api/explain/assets` · MCP `list_assets` | 94 markets (34 Kraken crypto, 60 IEX stocks and ETFs). For each: price, % change and its window, freshness label, source, badge, headline light | **Public** (already used) | Crypto quote 48 s old (BTC); stocks show the 2026-11-12 session, with change since the 11 Nov close (T+1) | Stock rows must carry the IEX citation. A missing bar stays `null`. | Catalog rows: price, Live/Daily badge, % change with its window, status dot |
| **Asset detail** `GET /api/explain/assets/{symbol}` · MCP `get_quote`, `get_signal_light` | Quote, sparkline (96 × 15m crypto, daily stocks), leans for 15m, 1h and 1d with `sampleSize`, `hitRate`, `asOf` and `reason`, plus the gate (`failed[]`, `shadowWeeks`/`requiredWeeks`) | **Public** (used, but the track record isn't presented well) | BTC: 15m lean n=81 (`asOf` 21:15Z), 1h n=31, 1d n=0. Gate: 6 checks not met, 2 of 4 shadow weeks | Grey unless the gate passes and n ≥ 200 at ≥ 55%. A high hit rate on thin n is **not** evidence. | Asset detail: "ATLAS lean" with a track-record bar (81/200), the plain-language failed checks, and the horizons |
| **Shadow scores** `GET /api/analytics/shadow`, `/api/ml/shadow/status` · MCP `get_shadow_scores` | Signal15 and ML-meta paper shadow: n observed/resolved, hit rate, Brier, reliability bins, coverage weeks, gates | **Public** (MCP) | ML-meta: 39 observed, 29 resolved, 2 of 4 shadow weeks | `promotes: false`. Paper only. | "How ATLAS reached this" in the detail and the digest's evidence summary |
| **Move-card envelope** MCP `explain_context` | The public card Explain accepts (symbol, move %, `asOf`) and a deep link | **Public** | Same as the quote | Refuses when there's no real session move | The "Explain this move" button in the detail |
| **Daily brief** `GET /api/explain/daily-brief` | Today's official macro notes (Fed, etc.), earlier notes marked as earlier, market freshness, morning-report metadata | **Public** (used) | Status `ready` for 2026-11-13; no official notes yet today, so it says so | Only today counts as today. Earlier notes are labelled earlier. | Digest header and "Official notes" |
| **Nowcast** `GET /api/ai/predictions/nowcast?symbol=` · `/nowcast/calibration` | Zero-drift random-walk band (80%, split-conformal). Live coverage 0.786 vs a 0.80 target (crypto 15m cell n=18,984) | Desk only | Live. The grading ledger is **lagging** (374k due unscored), so its stats are marked stale | Labelled "Predicted (not market data)". Claims no directional skill. Must show "stale" while grading lags. | Later, in the detail: "Typical range for the next 15 minutes" with its coverage record, never a direction |
| **Forecast board** `GET /api/ai/predictions/forecast-board?horizon=` | Direction probability per symbol, 7-day record, `resolves_at` | Desk only | Per-symbol records (n, hit rate, coverage) present; all below the gate | Below the gate. Only the record (n, hit rate) is meaningful. | Folded into the lean's track record, never shown as a call |
| **Live AI observer** `GET /api/market/live-ai-prediction` | Online logistic p_up with n=11 and Brier 0.21 vs a 0.25 baseline | Desk only | Live | Says "experimental… uncalibrated", `validated:false` | Not shown, or shown only as "learning (11 samples)". Never a percentage. |
| **Drop studies** `var/research/dip/report.json` (crypto), `stock_report.json` (stocks) | Descriptive base rates after big drops: stocks: 252 sessions × 998 liquid symbols, −3% threshold events split market-led vs single-stock; crypto: z-score drops | **Not exposed** (files only) | Stocks 2026-11-13 09:38; crypto 2026-11-12 20:29 | Descriptive history only, with refusal below minimum counts. IEX/EDGAR/FINRA terms limit display to the owner. | Detail: "What usually happened after drops like this" (base rate and count) when today's move qualifies |
| **SEC EDGAR filings** `GET /api/context/filings` | Recent 8-K metadata (form, title, filed date, sec.gov link) | Desk only | Live, but the `symbol` parameter is **ignored** (`ticker: null`), so it returns market-wide filings | Metadata only; link out to sec.gov | Detail: "Filings" (8-K items for this ticker, with links). Needs per-ticker filtering. |
| **GDELT news** `GET /api/context/news` | Headline metadata and tone, cited to GDELT | Desk only | `status: error` ("non-JSON reply"). The query ignores the symbol. | Untrusted text, context only. Tone is GDELT's number. | Detail: "What was in the news" (up to 3 headlines with time and source) |
| **FINRA short interest** | Daily short interest / short-sale volume | **Not built** (data-rights grant exists, no ingest found) | n/a | Owner-only display | Detail: "Short interest" line for stocks, once built |
| **Regime** `GET /api/intel/regimes` | Market regime label | Desk only | `no_data` (GC) | Not shown when `no_data` | Digest: one regime line per class, once it has data |
| **ML forecasts** `GET /api/investment-intelligence/ml-forecasts/{symbol}` | p_up and a price cone | **Do not use** | Reported a BTC `current_price` of 104.95, a fixture value, so it isn't grounded | Fails the no-fake-numbers rule | Not shown |
| **Chart read** `GET /api/ml/chart-read` | Direction, stop and target | **Do not use** | `data_mode: synthetic`, labelled fixture bars | Synthetic, and uses trade wording | Not shown |
| **33 chart layers** (desk) | Overlays on the desk chart | Desk UI | Live | Paper only | "Open in ATLAS desk" link only |

### Findings worth acting on
1. **The track record is already in the catalog but hard to read.** For example, BTC 15m shows `sampleSize: 81`, `hitRate: 0.963`, gate failed: `n_oos, brier_beats_base_rate, logloss_beats_base_rate, deflated_sharpe, pbo, shadow_weeks`. The detail shows that as raw gate codes inside "Why this colour?". Explain should translate the codes and show "81 of 200 samples" as a bar. A 96% hit rate on 81 samples isn't shown as a headline, because it hasn't cleared the gate.
2. **Market breadth is real and free.** At 16:33 on 13 Nov, 29 of the 32 crypto markets with a 24 h change were down (median −2.6%), and 44 of 60 stocks were down since the 11 Nov close (median −0.75%). That alone is a grounded "what changed today" line, with source and time.
3. **News and filings aren't per-symbol yet**, so Explain can't honestly show "what moved it" per asset. Those are requests for Yoyo (section 6).
4. **Data-rights flag (owner decision needed).** `src/wallet/box-preview.json` in this public repo holds real Kraken and IEX-derived prices captured on the build box. The hosted app serves them under `?assets=box`. The IEX/EDGAR/FINRA data-rights record in ATLAS scopes those feeds to "no display to anyone but the owner". IEX's own terms allow redistribution with citation, but the owner's grant is stricter. **Recommendation:** remove the real-data preview from the public build, or keep it to the "not connected" state. Not changed in this PR.

## 3. Assets catalog and detail: current vs proposed

Screenshots: `/workspace/shots/explain-assets/current/` (catalog, catalog offline, BTC and NVDA detail, Explain tab).

| Part | Today | Proposed |
|---|---|---|
| Catalog row | Icon, name, symbol, Stale/Live/Daily badge, price, % change, grey dot | Same row, plus a tiny track-record meter under the dot (n/200) and the change window as small text ("24h" or "since 11 Nov close") |
| Catalog header | "26 of 26 assets · 0 live" (box preview) | "94 markets · crypto live 48 s ago · stocks 12 Nov close (IEX, T+1)", so freshness and source sit up front |
| Detail: price | Price, change, freshness, sparkline | Keep. Add "Source · asOf" as one line. |
| Detail: lean | "Not enough evidence", chips "Hit rate —" / "Sample —", horizon list, raw gate reason | **ATLAS lean card**: light, label, a track-record bar per horizon (81/200, hit rate shown but muted until n ≥ 200), then "What it still needs" as plain bullets (for example "2 of 4 paper weeks", "probabilities not yet better than the base rate") |
| Detail: context | none | **Context** (each with its own honest empty state): Filings · News · Short interest · "After drops like this" (drop study). Each says "Not connected yet" until ATLAS exposes it per symbol. |
| Detail: how we know | "Source: Kraken spot." | **How we know**: engine, source, asOf, gate status, and the IEX citation for stocks |

## 4. The grounded daily digest (whole market + per asset)

Built only from `/api/explain/assets` and `/api/explain/daily-brief`, which exist today. More engines plug in later.

```
Today · Fri 13 Nov 2026 · America/Toronto              [Live 48 s ago]
───────────────────────────────────────────────────────────────────
What changed
  Crypto  29 of 32 down over 24h · median −2.6%      Kraken 1m · 16:33
  Stocks  44 of 60 down since the 11 Nov close · median −0.75%   IEX HIST · 12 Nov
Biggest moves (by size, either way)
  TIA   −8.7%  24h       ● grey · 129/200 samples   Kraken · 16:32
  SMCI −11.3%  1 session ● grey · 0/200 samples     IEX · 12 Nov
  …
ATLAS evidence
  0 of 94 markets have cleared the gate. Closest: INJ 140/200.
  Still needed: out-of-sample size, beating the base rate, 2 of 4 paper weeks.
Official notes
  None yet today. An earlier note from 12 Nov is on file (not today's).
Not connected yet
  Per-asset news (GDELT) · filings by ticker (EDGAR) · short interest (FINRA) · drop-study base rates
How we know
  Each line names its source and time. Grey means not enough evidence, not a forecast.
```

Per-asset digest (the top of the asset detail, and the "Today" card when you highlight a ticker):
**What changed** (move, window, source, time) → **ATLAS lean with evidence** (light, n/200, hit rate muted, what's missing) → **Context** (filings / news / short interest / drop base rate, each with its own empty state) → **How we know**.

When ATLAS isn't reachable (always the case for the hosted site), the digest shows one honest card: "Connect ATLAS on this computer to see today's grounded digest. Nothing is estimated." No sample numbers.

## 5. Minimal Explain screen

Today the popup's Explain tab stacks eight blocks: title row, engine strip, brief card, text box, two buttons, empty-state card, recent card, footer. Proposed (popup, 360 × 600):

```
┌ ATLAS Explain                    ● Not connected ⌄  ⋮ ┐
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Highlight text on the page, or type a term…   │  │
│  │                                               │  │
│  │ [ ✦ Explain highlight              ]          │  │  one smart button: "Explain" once you type
│  └───────────────────────────────────────────────┘  │
│  ● On-device · Gemini Nano ready              ⓘ     │  one quiet line (was a card)
│                                                     │
│  Today's digest · Live 48 s ago               ›     │  one row; opens the grounded digest
│                                                     │
│  (answer card appears here)                         │
│                                                     │
│  Recent  stop-limit · margin · IV                   │  compact chips, max 3
│─────────────────────────────────────────────────────│
│  Educational information, not investment advice.    │
│  Explain  Assets  Signal  Glossary  Settings        │
└─────────────────────────────────────────────────────┘
```

Rules: one primary action, at most three secondary rows, no card inside a card, and the title kept for screen readers only. The empty-state card becomes one hint line ("Right-click any text → Explain with ATLAS · Alt+Shift+X").

## 6. Prioritized build list

| # | Build | Data | Needs Yoyo? |
|---|---|---|---|
| 1 | **Minimal Explain screen**: one smart button, one-line engine status, digest row, hint line, compact recent | none | No |
| 2 | **Grounded market digest** sheet: what changed (breadth, medians), biggest moves with track record, evidence summary, official notes, "not connected yet" list, how we know | catalog + daily brief (live today) | No |
| 3 | **Track record in asset detail**: n/200 bar per horizon, plain-language failed checks, hit rate muted below the gate | catalog/detail (live today) | No |
| 4 | **Per-asset context slots** with honest empty states (filings, news, short interest, drop study) | — | Shows "not connected yet" until 6–9 land |
| 5 | Remove or limit the real-data box preview in the public build | — | No (owner decision) |
| 6 | Filings by ticker | EDGAR | **Yes** (R1) |
| 7 | News by symbol | GDELT | **Yes** (R2) |
| 8 | Drop-study base rates per symbol and today's qualifying move | dip reports | **Yes** (R3) |
| 9 | Short interest | FINRA | **Yes** (R4, ingest first) |
| 10 | Nowcast range with coverage record (no direction) | nowcast | **Yes** (R5) |

## 7. Requests for Yoyo (ATLAS endpoints, read-only, `atlas.public` scope)

- **R1 `GET /api/explain/assets/{symbol}/filings`**: 8-K/10-Q/10-K metadata for that ticker (form, items, filed time, sec.gov URL). Today `/api/context/filings` ignores `symbol` (`ticker: null`).
- **R2 `GET /api/explain/assets/{symbol}/news`**: up to 5 GDELT headlines for the company or coin name over the last 24 h (title, source domain, time, URL, GDELT tone labelled as GDELT's). Today `/api/context/news` ignores `symbol` and currently errors ("non-JSON reply").
- **R3 `GET /api/explain/assets/{symbol}/drop-context`**: whether today's move qualifies under the drop-study rules (−3%/−5% stocks, z ≤ −3 crypto), plus the matching descriptive base rate (n events, cluster days, bounce rate after cost at 1/5/20 with CI, market-led vs single). Must refuse below minimum counts. Owner-only display per the data-rights record.
- **R4 FINRA short-interest ingest**, then `GET /api/explain/assets/{symbol}/short-interest` (latest settlement date, shares short, days to cover, as published).
- **R5 `GET /api/explain/assets/{symbol}/range`**: nowcast 80% band for the next bar, with live coverage and `stale: true` while grading lags. Never a direction.
- **R6 Catalog summary fields** (nice to have): `breadth` per class (up/down/flat counts and median change over the stated window) in `/api/explain/assets`, so Explain doesn't recompute across every row.
- **R7 Fix or label** `/api/investment-intelligence/ml-forecasts/{symbol}` (it returns a price that isn't the asset's) and keep `/api/ml/chart-read` (synthetic fixture with trade wording) off every public surface. Explain won't read either.
- **R8 Check the timestamp**: `/api/ai/predictions/asset?symbol=BTCUSDT` reported a `last_real` time that looked later than the time of the request. Minor, but worth a check.
