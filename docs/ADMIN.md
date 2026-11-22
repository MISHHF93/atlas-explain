# Admin view: connector usage

The owner sees how much the connector is used in the web app's account sheet, on a **Connector usage** card.
Open it at https://atlas-explain.web.app/app/admin (or Account in the app) while signed in.

## What it shows

- Tool calls per day for the last 30 days (UTC), with errors marked.
- Calls by tool, by assistant (Claude, ChatGPT, Cursor, VS Code, Gemini, Other or Unknown, read from the
  caller's User-Agent), and new connections by the name the assistant gives itself.
- When counting started. Calls before the admin view was deployed weren't counted.

Not shown here: web-app sign-ups (Firebase console → Authentication → Users) and total requests since launch
(Cloudflare dashboard → Workers & Pages → atlas-explain-mcp → Metrics).

## How it works

- `src/mcp/stats.ts`: after each tool call or `initialize`, the Worker adds one to that day's counters in a
  SQLite-backed Durable Object (`STATS`, class `UsageStats`). Only counts: never the question, the answer,
  an IP address or the raw User-Agent. Counts older than 400 days are dropped. If counting fails, the call is
  unaffected.
- `src/mcp/admin.ts`: `GET /admin/stats?days=30` needs `Authorization: Bearer <Firebase ID token>`. The Worker
  checks the token's signature against Google's published keys, the project (`atlas-explain`), expiry and
  that the email is verified, then that the email is in the `ADMIN_EMAILS` secret. Anyone else gets 401 or
  403. Browsers may call it only from the web app's own addresses (or localhost).
- `src/wallet/admin-usage.ts`: the card. It asks `/admin/stats` with the signed-in account's token and shows
  nothing unless the answer is 200, so the website never names who the owner is.

There is no password: sign in to the web app with Google (or an email link) as the owner.

## Setup (once)

Who may see the counts is a Worker secret, never in the code or on GitHub:

```bash
npx wrangler@4 secret put ADMIN_EMAILS
```

Type the email (or a comma list) when asked. To change it later, run the same command again.

## Cost

Free. Durable Objects on the Workers Free plan allow 100,000 requests and 100,000 rows written a day; each
tool call writes three or four rows, so counting stops at roughly 25,000 to 30,000 calls a day (the calls
themselves still work) and resumes at 00:00 UTC. The Free plan never charges.
