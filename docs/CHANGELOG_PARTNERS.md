# ATLAS Explain: changes for partner compliance teams

Each entry says what's new, where its numbers come from, under what licence, and what it will never do. The design is in `docs/V2_DESIGN.md`.

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
