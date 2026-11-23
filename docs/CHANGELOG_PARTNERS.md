# ATLAS Explain: changes for partner compliance teams

Each entry says what's new, where its numbers come from, under what licence, and what it will never do. The design is in `docs/V2_DESIGN.md`.

## 2026-11-19: ATLAS credits, built and switched off

**What's new**
- Usage can be counted in credits instead of calls (`docs/USAGE_PRICING.md`):
  - 1 credit for a simple answer;
  - 2 for a data series or the notable list;
  - 3 for an evidence brief or a decision explanation.
- Errors, refusals and requests that aren't tool calls cost nothing.
- With credits on, every answer says what it cost and what is left today: in the `X-Credits-Used` and `X-Credits-Remaining` headers, in `meta.credits` for REST, and in the result's `_meta` for MCP.

**Status:** switched off. Partners still see one call per request, as before. Nothing is charged; switching credits on doesn't charge anything either. Billing is a separate, later step.

## 2026-11-23: what changed since a date (1.23.0)

- New tool `whats_changed(topic, since | days)`: each official figure that moved since a date (up to 90 days), the central banks' statements and speeches given since, and the next rate decisions. `changes[]` carry `claim`, `from`, `to`, `source` and `asOf`; `documents[]` carry `kind`, `institution`, `title`, `url` and `publishedAt`.
- `economy.json` gains `firstSeen` (when each period of each indicator first appeared) and `trackingSince`. Monthly figures are compared from 23 Nov 2026; earlier dates say so.

## 2026-11-22: an inflation calculator (1.22.0)

- New tool `inflation_calculator`: what an amount from one year buys in another, from the official consumer price index of the US (from 1913), Canada (from 1914), the UK (from 1988) or the euro area (from 1997), as yearly averages. Returns `value`, `changePct`, `yearlyPct`, a `points` array (one per year, for a chart) and the source with its licence. Years outside a country's index are refused with the range, never estimated.
- Also in the web app's Tools section, worked out in the browser.

## 2026-11-22: Canada, UK and euro-area inflation and jobs (1.21.0)

- `economy_snapshot`, `/economy` and `data_series` add five figures, each from its own statistics agency with about a year of monthly history: Canada's inflation over 12 months and unemployment rate (Statistics Canada, Open Licence), the UK's CPI inflation and unemployment rate (Office for National Statistics, Open Government Licence; the UK rate is a three-month average, dated by its last month) and the euro area's unemployment rate (Eurostat). New ids: `ca_cpi`, `ca_unemployment`, `uk_cpi`, `uk_unemployment`, `euro_unemployment`.
- Topics accept a country (`canada`, `uk`, `euro`) or a country and a figure (`canada inflation`, `uk jobs`, `eurozone unemployment`).
- Evidence briefs on euro, pound and Canadian-dollar assets show that currency's central bank and inflation next to the Fed's.
- No change to existing fields; the new figures appear in the same `indicators` list.

## 2026-11-19: links to official prices, and OECD share-price indices (1.20.0)

**What's new**
- **Links to the official live price.** Stocks, funds, indices and futures whose prices ATLAS Explain may not show now link to the official page:
  - stocks and funds: the listing exchange (Nasdaq.com or NYSE.com);
  - indices: the index provider (S&P Dow Jones Indices, Nasdaq, FTSE Russell, Cboe);
  - futures: CME Group.

  These are links only: no third-party price is copied, stored or shown.
- **Clearer wording.** The note on an unpriced asset now leads with what is shown (for example, the company's figures from its SEC filings), then gives the reason in one line.
- **`data_series` adds `world_share_prices`.** It holds the OECD's monthly share-price index (all shares, 2015 = 100) for 17 G20 members, a broad official measure of each stock market.

**Licence:** the OECD's terms allow its data to be downloaded, shared and distributed "for any purpose, even for commercial use", with credit to the OECD. Each answer carries the credit.

**Still not offered:** prices of individual stocks, funds, index levels or futures. No free source licenses them for display.

## 2026-11-18: the ECB and the Bank of England (v2, phase 2b, 1.19.0)

**What's new:** `decision_explainer` and `speech_tracker` also cover the European Central Bank (deposit facility rate) and the Bank of England (Bank Rate). Their decision days are watched like the Fed's and the Bank of Canada's.

**Where the text comes from**
- **ECB:** its own list of monetary policy decisions, plus each decision's press release, and its press RSS feed for speeches and interviews.
- **Bank of England:** its news RSS feed and the Monetary Policy Summary pages, plus its speeches RSS feed. Only the summary is used, not the minutes on the same page.
- **The decision** is read from each bank's own wording. For the Bank of England that means the Committee's own vote (for example "voted by a majority of 6–3 to maintain Bank Rate at 3.75%"), never a dissenting member's.

**Licence**
- **ECB:** its notice says "Reproduction is permitted provided that the source is acknowledged", so ECB text is quoted in full, with the ECB named as the source.
- **Bank of England:** its terms for commercial reuse are being confirmed. Until then, quotes are cut to 25 words with links, as for the Bank of Canada.

**What it will never do:** add a prediction. A bank's own forward-looking words (the ECB writes, for example, that energy effects "are likely to drive up inflation") appear only inside quotation marks, attributed to that bank.

## 2026-11-18: rate decisions and speeches from the banks' own statements (v2, phase 2)

**What's new** (both behind the Worker's `V2_TOOLS` variable; **switched on in the public connector on 18 Nov 2026, 1.18.0**)
- **`decision_explainer(bank, date?)`**: what the Federal Reserve or the Bank of Canada decided at its latest decision (or the one before), how the statement's wording changed from the previous one, word by word, and the sentences in which the bank says what it is weighing, quoted with links. Also gives the next scheduled date.
- **`speech_tracker(bank, days?)`**: recent speeches and remarks, with the speaker, title, date, the bank's own one-line description and a link.

**Where the text comes from**
- Each bank's own RSS feeds and release pages, read every 3 hours. On decision days the Worker checks every 10 minutes, from the scheduled time to 3 hours after, so a new statement is stored within one 10-minute run.
- Kept in `/data/v1/docs.json`: the last two statements per bank (full text, for the comparison) and up to 12 recent speeches each.
- FRED is not used.

**Licence**
- Federal Reserve text is a US government work (public domain) and is quoted in full.
- Bank of Canada text: its terms for commercial reuse are being confirmed. Until then, every quote is cut to at most 25 words (40 for "what it's weighing") and links to the full text.

**What it will never do**
- Say what a bank will do next, rate the decision, or add its own reading. The "what it's weighing" sentences are the bank's own words, picked out by fixed phrase rules, not a summary.
- Show anything without its source address and date. Tests check every returned claim carries both.

**Not yet:** the ECB and the Bank of England (phase 2b), and news coverage of decisions (phase 4).

## 2026-11-18: rate-change impact (v2, phase 1)

**What's new**
- **`rate_change_impact`**, an MCP tool. It works out what a change in interest rates would do to a person's own variable-rate mortgage payment, HELOC interest, savings interest or GIC/CD renewal. It's off by default: it is listed only when the Worker's `V2_TOOLS` variable names it. **Switched on in the public connector on 18 Nov 2026 (1.17.0).**
- **Rate-change calculator widget** at `https://atlas-explain.web.app/embed/rate-impact.html`, for partner pages. It can be framed by any HTTPS site. Query parameters prefill it (`country`, `product`, `balance`, `rate`, `change`, `months`).

**Where the numbers come from**
- Only from the numbers the person enters. No market data or third-party content is used, so there is nothing to license or credit.
- The widget runs entirely in the browser: nothing typed is sent to ATLAS Explain or anyone else.

**How it calculates**
- Mortgages:
  - standard amortization, `P = B·i / (1 − (1+i)^−n)`, rounded to the cent;
  - compounding is semi-annual by default for Canada (the way Canadian lenders state mortgage rates) and monthly for the US, and can be overridden;
  - checked against published reference payments, for example $100,000 at 5% over 25 years in Canada is $581.60 a month, and $300,000 at 6% over 30 years in the US is $1,798.65.
- HELOC: interest-only, balance × rate ÷ 12.
- Savings: simple yearly interest.
- GIC/CD: yearly compounding at maturity, or simple interest for terms under a year.
- Every answer states the assumptions it used.

**What it says about the central bank**
- Each answer names which rate the product usually follows:
  - Canada: lender prime, which follows the Bank of Canada;
  - US: prime, which follows the Fed's target range, and SOFR-based resets for adjustable mortgages.
- It says that savings and GIC/CD rates are set by each institution.

**What it will never do**
- Say whether rates will change, or by how much. The change is always the person's own scenario.
- Recommend a product, a lender, or locking or breaking a mortgage.
- Store or send the person's numbers.

**Tests**
- Reference payments to the cent (Canada and US).
- An independent cent-rounded amortization schedule that pays each loan off.
- Input limits.
- A scan of every answer for advice or prediction wording ("buy", "sell", "you should", "will cut", "likely").
