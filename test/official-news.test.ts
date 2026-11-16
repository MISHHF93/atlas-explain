import { describe, expect, it } from "vitest";
import { OFFICIAL_FEEDS, OFFICIAL_NEWS_ID, NEWS_SCHEMA, parseRss, readNewsFile } from "../src/core/news";
import { captureNews, type CaptureEnv } from "../src/data/capture";

const NOW = Date.parse("2026-11-16T12:00:00Z");

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Press</title>
<item><title><![CDATA[Federal Reserve Board announces approval of application by Tesla &amp; Co.]]></title>
<link>https://www.federalreserve.gov/newsevents/pressreleases/a.htm</link><pubDate>Mon, 16 Nov 2026 06:30:00 -0500</pubDate></item>
<item><title>Agencies extend comment period for proposed guidance</title>
<link>https://www.federalreserve.gov/newsevents/pressreleases/b.htm</link><pubDate>Fri, 13 Nov 2026 16:00:00 -0500</pubDate></item>
<item><title>Too old: annual report on something from last month</title>
<link>https://www.federalreserve.gov/c.htm</link><pubDate>Mon, 02 Nov 2026 10:00:00 -0500</pubDate></item>
<item><title>No link here, so it is skipped entirely</title><pubDate>Mon, 16 Nov 2026 09:00:00 -0500</pubDate></item>
<item><title>Strong buy now: you should buy this stock today</title>
<link>https://www.federalreserve.gov/d.htm</link><pubDate>Mon, 16 Nov 2026 08:00:00 -0500</pubDate></item>
</channel></rss>`;

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Statement on the euro area financial system</title>
<link href="https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html"/><updated>2026-11-16T08:30:00Z</updated></entry></feed>`;

describe("official press releases", () => {
  it("reads RSS and Atom: decodes the title, keeps the link and time, and drops old, unlinked or trade-instruction items", () => {
    const items = parseRss(rss, "federalreserve.gov", NOW);
    expect(items.map((i) => i.title)).toEqual([
      "Federal Reserve Board announces approval of application by Tesla & Co.",
      "Agencies extend comment period for proposed guidance",
    ]);
    expect(items[0]).toMatchObject({ domain: "federalreserve.gov", seenAt: "2026-11-16T11:30:00.000Z" });
    expect(parseRss(atom, "ecb.europa.eu", NOW)).toEqual([
      { title: "Statement on the euro area financial system", url: "https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html", domain: "ecb.europa.eu", seenAt: "2026-11-16T08:30:00.000Z" },
    ]);
    expect(parseRss("not xml at all", "sec.gov", NOW)).toEqual([]);
  });

  it("are captured even when GDELT refuses, kept as market news and matched to assets they name", async () => {
    const env: CaptureEnv = {
      get: async (url) => {
        if (url.includes("gdeltproject")) return "Please limit requests to one every 5 seconds";
        if (url === OFFICIAL_FEEDS[0]!.url) return rss;
        if (url === OFFICIAL_FEEDS[3]!.url) return atom;
        throw new Error("offline");
      },
      sleep: async () => undefined,
      now: NOW,
      log: () => undefined,
    };
    const file = await captureNews(env, null);
    expect(file.items[OFFICIAL_NEWS_ID]?.map((i) => i.domain)).toEqual(["federalreserve.gov", "ecb.europa.eu", "federalreserve.gov"]);
    expect(file.items["stock:US:TSLA"]?.[0]?.domain).toBe("federalreserve.gov");
    // The app and the connector read the market list back, and keep a release for four days.
    const read = readNewsFile(JSON.parse(JSON.stringify(file)), NOW + 3 * 86_400_000);
    expect(read?.items[OFFICIAL_NEWS_ID]?.length).toBeGreaterThan(0);
    expect(readNewsFile({ schema: NEWS_SCHEMA, generatedAt: "x", items: { "not:a:target": [] } }, NOW)?.items).toEqual({});
  });

  it("keeps the last releases when every feed fails", async () => {
    const prev = { schema: NEWS_SCHEMA, generatedAt: "2026-11-16T09:00:00Z", items: { [OFFICIAL_NEWS_ID]: parseRss(rss, "federalreserve.gov", NOW) } } as const;
    const env: CaptureEnv = { get: async () => { throw new Error("offline"); }, sleep: async () => undefined, now: NOW, log: () => undefined };
    const file = await captureNews(env, readNewsFile(prev, NOW));
    expect(file.items[OFFICIAL_NEWS_ID]).toHaveLength(2);
  });
});
