# ATLAS Explain: changes for partner compliance teams

Each entry says what's new, where its numbers come from, under what licence, and what it will never do. The design is in `docs/V2_DESIGN.md`.

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
