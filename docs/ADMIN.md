# Owner dashboard

The owner's dashboard is its own page, apart from the user app: **https://atlas-explain.web.app/admin**
(the old `/app/admin` address redirects there). Sign in with the owner's Google account. If you're already
signed in to the web app with it, the dashboard opens straight away. The page is never indexed by search engines.

## What it shows

- **Connector usage** for the last 7, 30 or 90 days (UTC): calls today, last 7 days, the whole range,
  connections and errors; a bar per day (errors marked red); calls by tool and by assistant (Claude, ChatGPT,
  Cursor, VS Code, Gemini, Other or Unknown, from the caller's User-Agent); connections by the name the
  assistant gives itself. Counting began when the admin view was deployed (22 Nov 2026).
- **Live data**: when each data file was last saved, its schedule, and whether it's behind. `docs.json`
  (central-bank statements and speeches) is checked every 3 hours but saved only when a bank publishes
  something new, so it shows as behind only after two weeks with nothing saved.
- **Partner API keys**: each active key's partner, tier, calls today and in the last 7 days, and daily limit.
- **Service**: connector version, tools served, whether usage counting and partner credits are on.
- **More numbers elsewhere**: links to Cloudflare (all requests since launch), Firebase (web-app sign-ups,
  hosting traffic), GitHub traffic and the MCP Registry listing. Web-app sign-ups aren't on the dashboard
  itself: reading them needs a Firebase service account, which isn't set up.

## How it works

- `src/mcp/stats.ts`: after each tool call or `initialize`, the Worker adds one to that day's counters in a
  SQLite-backed Durable Object (`STATS`, class `UsageStats`). Only counts: never the question, the answer,
  an IP address or the raw User-Agent. Counts older than 400 days are dropped. If counting fails, the call is
  unaffected.
- `src/mcp/admin.ts`: `GET /admin/overview?days=30` (and `/admin/stats`, the counts alone) need
  `Authorization: Bearer <Firebase ID token>`. The Worker checks the token's signature against Google's
  published keys, the project (`atlas-explain`), expiry and that the email is verified, then that the email
  is in the `ADMIN_EMAILS` secret. With no secret set it answers "No owner account is set up yet"; for any
  other account, "This account isn't the owner's". Browsers may call it only from the site's own addresses.
- `admin.html`, `src/admin/`: the page. It signs in with Firebase (Google), asks `/admin/overview` and draws
  the answer. It never names the owner; the connector decides.

There is no password.

## Setup (once)

Who the owner is lives only in a Worker secret, never in the code or on GitHub. In the project folder:

```bash
npx wrangler@4 secret put ADMIN_EMAILS
```

Type the email (or a comma list) when asked. Check it was saved; the list should show `ADMIN_EMAILS`:

```bash
npx wrangler@4 secret list
```

## Cost

Free. Durable Objects on the Workers Free plan allow 100,000 requests and 100,000 rows written a day; each
tool call writes three or four rows, so counting stops at roughly 25,000 to 30,000 calls a day (the calls
themselves still work) and resumes at 00:00 UTC. Each dashboard load reads a few KV values and lists the
partner keys, far inside the free daily limits. The Free plan never charges.
