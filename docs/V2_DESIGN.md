# ATLAS Explain v2: read the world, explain what it means for me

Design doc, 18 Nov 2026. Status: **proposed, not built.** Implementation follows approval, behind feature flags.

v1 reports figures. v2 reads what institutions say (statements, minutes, speeches) and connects it to the figures and to the coverage, so it can say what was decided, what changed in the wording, what the bank says it is watching, and what a given change would do to someone's own numbers. It stays education only.

Where this conflicts with standing rules (zero budget, billing off, no advice), the rule wins and the doc says what that changes. Those points are marked **Owner decision**.

---

## 1. Architecture

```
            Cloudflare Worker (existing, free plan)
 ┌─────────────────────────────────────────────────────────────────┐
 │ crons (existing)     */10 crypto  ·  37 */3 news  ·  47 */6 market│
 │                      17 */6 economy + world                       │
 │ NEW decision watch:  rides the */10 cron; active only in a window │
 │                      from a scheduled decision time to +3 h       │
 │ NEW docs capture:    rides the 37 */3 news cron (statements,      │
 │                      minutes, speeches, release notes)            │
 │                                                                   │
 │  capture (src/data/*) ──► KV "DATA" ──► tools (src/mcp/server.ts) │
 │                                   └──► partner API (/api/v1)      │
 │                                   └──► widgets (static pages)     │
 └─────────────────────────────────────────────────────────────────┘
```

- **No new infrastructure.** Everything is capture into KV plus read-only tools, as in v1. No database, no queue, no LLM on the server.
- **No model on the server, on purpose.** Diffs, "what they're watching" and summaries are built deterministically from the official text: word-level diffs, sentence extraction by phrase rules, and each agency's own description. That keeps cost at zero and every sentence traceable. The client's model (Claude, or a partner's) does the plain-language framing from that sourced material.
- **Decision watch (the 15-minute target).** The economy file already holds each decision's exact time (`decisionTime`). In a window from the scheduled time to 3 hours after, the existing 10-minute cron also fetches that bank's monetary-policy feed. When a new statement appears, it stores the text, diffs it against the previous one and writes `docs/decisions/<bank>/<date>.json`. Worst case it lands 10 minutes after publication, plus one fetch. The KV cost is one write per decision.

## 2. Sources and licence status

✓ = public domain or reuse explicitly allowed with credit. ⚑ = to confirm before commercial redistribution (owner or lawyer). ✗ = not used.

### Tier A: official text (store, quote with attribution)

| Source | What | How (checked 18 Nov 2026) | Licence |
|---|---|---|---|
| Federal Reserve | FOMC statements, minutes, implementation notes | `federalreserve.gov/feeds/press_monetary.xml` (200; lists statement and minutes), then the release page | ✓ US government work, public domain |
| Federal Reserve | Speeches, testimony | `feeds/speeches.xml`, `feeds/testimony.xml` (200) | ✓ public domain |
| Federal Reserve | SEP (projections table) | release page with the statement on SEP meetings | ✓ public domain. Shown as **the Fed's own published projections, attributed**, never as ours |
| Bank of Canada | Rate announcements, MPR, speeches, Summary of Deliberations | `bankofcanada.ca/content_type/{press-releases,speeches,publications/mpr,summary-of-deliberations}/feed/` (200) | ⚑ Its terms allow non-commercial reproduction; commercial redistribution of full text needs permission. Until confirmed: store the full text for diffing, but return only short attributed quotes plus links in partner output |
| ECB | Decisions, account of meetings, speeches | `ecb.europa.eu/rss/press.html` (200) and the speeches feed | ✓ reuse allowed with the source acknowledged (ECB copyright notice); confirm the wording once |
| Bank of England | Decisions, minutes, speeches | `bankofengland.co.uk/rss/{news,speeches}` (200) | ⚑ Confirm the terms (Open Government Licence or the Bank's own) |
| BEA | Release text, schedule | `apps.bea.gov/rss/rss.xml` (200, 49 items) | ✓ public domain |
| BLS | Release text, technical notes | The RSS feed refuses automated readers (403). The iCalendar schedule (in use) works, and release pages are fetched one at a time on release days | ✓ public domain. Access to confirm (403 on the feed) |
| US Treasury | Auctions (in use), press releases | TA_WS API in use. The press feed URL returned 404 | ✓ public domain. Press releases deferred |
| Statistics Canada | CPI, jobs | Official Web Data Service (`www150.statcan.gc.ca/t1/wds/rest`, 200). The website itself blocks automated reads | ✓ Statistics Canada Open Licence (commercial reuse with credit) |
| SEC, FINRA, CFPB | Investor alerts (feeds `scam_red_flags`) | SEC alerts RSS 403, CFPB 403. SEC press releases (in use) work | ✓ public domain. Alerts are fetched from pages with a declared user agent, as with EDGAR |
| FRED | — | **✗ not used** | Its terms restrict commercial caching and redistribution. Every series comes from the original agency |

### Tier B: news coverage (metadata only)

| Source | Stored | Licence |
|---|---|---|
| GDELT DOC API (in use) | Headline, outlet, URL, publish time | ✓ GDELT is open. Its rate limit (429 seen) means one paced query per topic per run |
| Outlets' own RSS (Reuters, CBC, Globe and Mail, etc.) | Headline, outlet, URL, time; only where robots.txt and the terms allow it | ⚑ per outlet |
| Licensed news API with redistribution rights | — | **Owner decision:** these cost money (zero-budget rule). Planned for when revenue covers it. Until then Tier B is headlines and links only |

**Tier B rules in code:** never store article bodies. A headline longer than 14 words is cut to 14 words plus "…", so no answer can carry 15 consecutive words from any outlet. Every item links to the original. **Owner decision:** the spec's own one-to-two-sentence paraphrase needs a model. With no server-side model, v2 stores no paraphrase. The client's model writes one from the headline when asked, and the tool tells it to paraphrase and link, not quote.

## 3. Storage schema (KV keys and shapes)

KV keeps the free-plan budget: reads are cheap, and writes happen only when something new appears (well under 1,000 a day).

```
docs/index.json                                   // newest 200 documents, all banks (one write per new doc)
  { schema: "atlas-docs-v1", generatedAt, items: DocRef[] }
docs/<bank>/<kind>/<yyyy-mm-dd>-<slug>.json       // one document
  { id, bank: "fed"|"boc"|"ecb"|"boe"|"bls"|"bea"|"statcan"|"sec",
    kind: "statement"|"minutes"|"speech"|"testimony"|"mpr"|"deliberations"|"release"|"alert",
    title, speaker?, publishedAt, url, licence: "public_domain"|"reuse_with_credit"|"confirm",
    text,                       // full text, Tier A only
    summary,                    // the agency's own description from its feed, attributed
    watching: Sentence[],       // sentences matched by the "watching" phrase rules, with paragraph index
    capturedAt, sha256 }
docs/decisions/<bank>/<yyyy-mm-dd>.json           // written by decision watch
  { bank, date, decidedAt, decision: { action: "raise"|"cut"|"hold", from, to, unit: "%" },
    statementId, previousStatementId,
    diff: [{ op: "same"|"added"|"removed", text }],   // word-level, sentence-grouped
    watching: Sentence[], coverage: Headline[], capturedAt }
news/coverage/<bank>/<yyyy-mm-dd>.json            // Tier B: { headline (≤14 words), outlet, url, publishedAt }
snapshots/<yyyy-mm-dd>.json                       // one a day: headline indicator values, for whats_changed
audit/<partnerHash>/<yyyy-mm-dd>.json             // flushed with usage (see 5)
```

## 4. New tools (MCP and partner API)

Every tool returns `structuredContent` with an `outputSchema`. Every claim object carries `source: { name, url }` and `asOf`, and claims without both are dropped before return (see 6).

### `decision_explainer(bank, date?)`
- **In:** `bank`: fed | boc | ecb | boe; `date`: YYYY-MM-DD, defaulting to the latest decision.
- **Out:** `decision { action, from, to, decidedAt }`; `statementChanges [{ op, text }]` (added and removed wording versus the previous statement, with unchanged context trimmed); `watching [{ text, source, asOf }]` (the bank's own sentences); `coverage [{ headline, outlet, url, publishedAt }]` (Tier B); `next { date, time }`; `sources[]`.
- **Never:** what happens next, or who "won".

### `whats_changed(topic, since)`
- **In:** `topic`: rates | inflation | jobs | canada | us | all; `since`: a date, at most 90 days back.
- **Out:** `changes [{ claim, from, to, period, source, asOf }]` from daily snapshots and indicator series; `documents [{ title, kind, url, publishedAt }]` published since then; `upcoming[]`. Each claim is one figure moving, written from a fixed template, e.g. "US CPI over 12 months went from 3.40% (Aug) to 3.74% (Sep)".

### `rate_change_impact(product, balance, rate_pct, change_pts, term_months?, amortization_months?, country?, compounding?)`
- **Products:** variable_mortgage (payment change), heloc (interest-only change), savings (interest change), gic_cd (renewal at the new rate).
- **Arithmetic** (pure, same pattern as `money_maths`, shared with the widget):
  - Mortgage payment: `P = B · i / (1 − (1+i)^−n)`, where `i` is the periodic rate from the stated compounding. For Canada the default is **semi-annual compounding**, as the Interest Act requires lenders to state. For the US the default is monthly. Both are overridable, and the answer always says which was used.
  - Payment, interest and balance are rounded to the cent at each period, as amortization schedules do.
- **Mapping, stated in the answer:** Canada prime → Bank of Canada; US prime and HELOCs → the Fed's target range; savings and GIC/CD rates are set by each institution and usually follow the policy rate, not one-for-one.
- **Never:** whether the change will happen. `change_pts` is the person's own scenario.
- **Acceptance:** matches a reference amortization schedule to the cent (fixtures from a published bank calculator, plus a spreadsheet PMT cross-check).

### `speech_tracker(bank, days?)`
- **Out:** `speeches [{ speaker, title, date, url, summary, summarySource }]`, where `summary` is the agency's own description from its feed, attributed. **Owner decision:** a neutral summary written by ATLAS would need a model. v2 uses the agency's own text, which is neutral by construction.

### `article_context(url)`
- **In:** a news URL.
- **How:** fetch only the page's metadata (title, publish time, outlet) where robots.txt allows it, never the body. Match by topic and date (±3 days) against stored official documents and indicator releases.
- **Out:** `article { headline ≤14 words, outlet, publishedAt, url }`, `officialSources [{ title, url, publishedAt }]`, `figures [{ name, value, period, source, asOf }]` (the record the story is most likely about, labelled "the official record for this topic and date", not "what the article says").
- **Limits:** if the page can't be read under its rules, it returns only date-matched official sources and says so.

### Existing tools that change
- `upcoming_events` and `decision_explainer` share the decision record.
- `scam_red_flags` gains the latest SEC, FINRA and CFPB alerts.
- `todays_headlines` uses the 14-word headline rule.

## 5. B2B packaging

| Piece | Design | Notes |
|---|---|---|
| White-label | Partner record in KV (exists) gains `brand {name, logoUrl, accent}`, `tone: "bank"|"workplace"|"classroom"`, `products [{ id, name, follows: "boc_policy"|"ca_prime"|"fed_target"|"us_prime"|"institution_set" }]` | Tone changes wording templates only, never the facts. `rate_change_impact` accepts `partner_product` and names the rate it follows |
| Widgets | Static pages on Firebase Hosting under `/embed/` (next-decision countdown, an "if they cut / hold / raise" card, the impact calculator) that read the public data files; no key in the page | Free data only, so they're safe to embed. A partner can add their brand by passing a public partner id that maps to brand settings, never to a key |
| Metering | Free: the public connector as today. Paid per call: partner keys (exist) with a tier and limit. Enterprise: redistribution rights and an SLA in a signed licence | **Owner decision:** billing stays off (`billing_enabled` false) and paid tiers need Stripe. v2 ships the metering and the tier fields; charging waits for the owner. An SLA needs the paid Workers plan (cost) |
| Audit log | Every partner response carries `meta.responseId` and `meta.sources [{ name, url, asOf, licence }]`. A daily file per partner holds `{ responseId, endpoint, sourceIds }`, flushed with usage (25 calls or 5 minutes) to stay within KV writes | The partner can also keep the `meta` from each response itself |

## 6. Guardrails as code

1. **Source-or-drop.** A post-processor walks every `structuredContent` before return. Any object with a figure (`value`, `from`/`to`, `rate`) or a `claim` that lacks `source.url` and `asOf` is removed, and the removal is counted. CI test: every tool and fixture returns zero unsourced claims.
2. **15-word rule.** CI test: for every Tier B string stored in fixtures, no tool output contains a run of 15 or more consecutive words from it. Headlines are cut to 14 words at capture.
3. **No advice, no predictions.** The existing trade-word scan, extended with "you should", "will (cut|raise|hold)", "likely to", "expected to" (except inside an attributed quote or an attributed market-implied figure) and "probability" without a named source. Runs on all outputs in CI.
4. **Market-implied odds** appear only with a named source and time (for example CME FedWatch). **Owner decision:** no free source with redistribution rights has been found yet, so v2 shows none.
5. **Jurisdiction.** Tools take `country` (US | CA). When it's missing and the answer depends on it, the tool returns both mappings and asks the client to confirm, instead of guessing.
6. **Neutral tone.** Templates are reviewed against a word list (loaded political terms). Speakers are named with their title only.

**Red-team set.** `test/redteam/prompts.json` holds 50 prompts such as "should I buy", "will they cut" and "is now a good time".
- **Automated part:** each prompt is mapped to the tool calls a client would make, and every output is checked by rules 1 to 3.
- **Manual part:** the same 50 prompts are run through Claude with the connector. Pass means 0 advice and 0 predictions, recorded in `docs/qa/REDTEAM.md`. This is manual because running a model in CI costs money (zero budget).

## 7. Feature flags

- `wrangler.toml [vars] V2_TOOLS = ""`: a comma list (`decision_explainer,whats_changed,rate_change_impact,speech_tracker,article_context`). Tools not listed are absent from `tools/list` and refused if called.
- `V2_CAPTURE = "0"|"1"`: document capture and decision watch.
- Partner record `features[]`: per-partner opt-in for white-label and widgets.
- Every flag is off by default; the public connector keeps its 18 tools until a flag is turned on. `rate_change_impact` was switched on 18 Nov 2026 (1.17.0).

## 8. Phases

**Built so far:** phase 1 (`rate_change_impact`, live). Phase 2, part one: Fed and Bank of Canada statements and speeches, `decision_explainer` and `speech_tracker`, behind the flag. Storage is simpler than section 3: one file, `/data/v1/docs.json`, holding the last two statements and twelve speeches per bank, written only when something changed. Phase 2b (the ECB and the Bank of England) built 18 Nov 2026: the ECB's statements come from its own decisions list (the include file its page loads), the Bank of England's from its news feed and the summary pages of the months before.


| Phase | Builds | Done when |
|---|---|---|
| 1 | `rate_change_impact` (pure arithmetic) with reference-to-the-cent tests and its widget | Matches the reference schedules exactly; red-team rules pass |
| 2 | Document capture (Fed, BoC, ECB, BoE, BEA), `speech_tracker`, decision watch, `decision_explainer` with wording diff | A replay of a recorded decision day writes the decision file within one cron tick; diff fixtures pass |
| 3 | `whats_changed` (built 23 Nov 2026, 1.23.0: instead of daily snapshot files, `economy.json` records when each period was first seen, with no extra KV writes) | Claims all sourced; 90-day window |
| 4 | Tier B coverage (headlines only), `article_context` (metadata only) | 15-word rule test passes; robots.txt honoured |
| 5 | White-label, widgets, audit log, metering fields | Partner fixtures pass; billing stays off |

Each phase ships with a partner-facing changelog entry in `docs/CHANGELOG_PARTNERS.md`: what's new, which sources, which licences, and what the tool will never do.

## 9. Acceptance criteria, mapped

| Criterion | How it's met | Test |
|---|---|---|
| Decision explained within 15 min | Decision watch on the 10-minute cron | Replay test with recorded feeds and a fake clock |
| 100% of claims sourced | Source-or-drop post-processor | Walks every tool's output in CI |
| Never 15 consecutive Tier B words | 14-word headline cap, no bodies stored | n-gram test in CI |
| Impact to the cent | Shared pure function | Reference schedules (CA semi-annual, US monthly) |
| 0 advice or predictions in 50 red-team prompts | Rules 1–3 plus manual Claude run | CI part automated; manual run recorded |

## 10. Owner decisions needed

1. A licensed news API (costs money). Until then: headlines and links only.
2. Server-side paraphrases and summaries need a model (costs money or a free tier with terms). Until then: agency text and client-side paraphrase.
3. Bank of Canada and Bank of England text licences for commercial redistribution (⚑).
4. Paid tiers and SLA: Stripe and the paid Workers plan, both waiting on revenue and `billing_enabled`.
5. A source for market-implied probabilities with redistribution rights, or none.
