# Security

Please report a security problem privately through GitHub's
[private vulnerability reporting](https://github.com/MISHHF93/atlas-explain/security/advisories/new),
not in a public issue.

In scope: the website and web app (https://atlas-explain.web.app), the connector and its data files
(https://atlas-explain-mcp.atlas-explain.workers.dev), and this repository.

What ATLAS Explain holds: it never reads account balances or account details. The connector is read-only
and stores nothing it is asked. The web app stores only a signed-in person's own history and plan.

Please don't run load tests, automated scanners that send large volumes of requests, or social
engineering against the operator or users. We'll acknowledge a report within 7 days.
