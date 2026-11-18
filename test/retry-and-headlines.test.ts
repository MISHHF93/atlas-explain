import { describe, expect, it } from "vitest";
import { assignNews, oneOfEachStory, storyKey, withoutSiteName, type NewsItem } from "../src/core/news";
import { cloudErrorCopy, isTemporaryCloudError } from "../src/core/timeouts";

const item = (title: string, domain: string, seenAt: string): NewsItem => ({ title, url: `https://${domain}/x`, domain, seenAt });

describe("each news story shows once", () => {
  it("drops the outlet's name from a headline, and keeps titles that only look like it", () => {
    expect(withoutSiteName("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | News Radio 101.9 Big WAAX")).toBe("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit");
    expect(withoutSiteName("Apple reports record services revenue - Reuters")).toBe("Apple reports record services revenue");
    // A dash inside the story stays: what follows is too long to be an outlet's name.
    expect(withoutSiteName("Fed holds rates - what it means for mortgages, savings and the dollar this winter")).toContain("what it means");
    expect(withoutSiteName("Boris Vujčić: Financial Stability Review - November 2026")).toBe("Boris Vujčić: Financial Stability Review - November 2026");
  });

  it("treats syndicated copies as one story (seen live on 18 Nov 2026), keeping the newest", () => {
    const a = item("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | News Radio 101.9 Big WAAX", "1019bigwaax.iheart.com", "2026-11-18T01:10:00Z");
    const b = item("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | PowerTalk 1460 AM & 101.1 FM", "powertalk1460.iheart.com", "2026-11-18T01:05:00Z");
    const c = item("Nvidia chairman says board does not intend to reinstate Jensen Huang", "ludlowadvertiser.co.uk", "2026-11-18T01:15:00Z");
    expect(storyKey(a.title)).toBe(storyKey(b.title));
    expect(oneOfEachStory([c, a, b]).map((n) => n.domain)).toEqual(["ludlowadvertiser.co.uk", "1019bigwaax.iheart.com"]);
    const nvda = Object.values(assignNews([a, b, c])).flat();
    expect(nvda.filter((n) => n.title.startsWith("Nvidia Exceeds")).length).toBeLessThanOrEqual(1);
  });
});

describe("cloud errors: honest words, and one retry only for a temporary failure", () => {
  const sdk500 = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/atlas-explain/models/gemini-3.5-flash-lite:generateContent: [500 ] Internal error encountered. (AI/fetch-error)";
  const sdk503 = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent: [503 ] The model is overloaded. (AI/fetch-error)";
  const sdk429 = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent: [429 ] Resource has been exhausted (e.g. check quota). (AI/fetch-error)";
  const appCheck = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent: [401 ] Firebase App Check token is invalid. (AI/fetch-error)";

  it("a 500 or 503 is temporary and retried; quota, App Check and bad requests are not", () => {
    expect(isTemporaryCloudError(sdk500)).toBe(true);
    expect(isTemporaryCloudError(sdk503)).toBe(true);
    expect(isTemporaryCloudError(sdk429)).toBe(false);
    expect(isTemporaryCloudError(appCheck)).toBe(false);
    expect(isTemporaryCloudError("AI: [400 ] Invalid JSON payload (AI/fetch-error)")).toBe(false);
  });

  it("no longer calls every error 'busy' because 'generateContent' contains 'rate'", () => {
    expect(cloudErrorCopy(sdk500)).toMatch(/temporary problem on Google's side/);
    expect(cloudErrorCopy(sdk429)).toMatch(/The cloud is busy/);
    expect(cloudErrorCopy(appCheck)).toMatch(/security check/);
    expect(cloudErrorCopy("AI: Error fetching from https://x/models/m:generateContent: [418 ] teapot")).toMatch(/Something went wrong/);
  });
});

describe("headlines kept from the last capture get the same clean-up", () => {
  it("a quick refresh that finds nothing new for a company still shows each story once, without outlet names", async () => {
    const { captureNews } = await import("../src/data/capture");
    const { NEWS_SCHEMA } = await import("../src/core/news");
    const prev = {
      schema: NEWS_SCHEMA,
      generatedAt: "2026-11-18T14:23:50Z",
      items: {
        "stock:US:NVDA": [
          item("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | News Radio 101.9 Big WAAX", "1019bigwaax.iheart.com", "2026-11-18T01:10:00Z"),
          item("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | PowerTalk 1460 AM & 101.1 FM", "powertalk1460.iheart.com", "2026-11-18T01:05:00Z"),
        ],
      },
    };
    const env = { get: async () => "", sleep: async () => {}, now: Date.parse("2026-11-18T14:38:00Z"), log: () => {} } as unknown as Parameters<typeof captureNews>[0];
    const out = await captureNews(env, prev as Parameters<typeof captureNews>[1], { gdelt: false });
    expect(out.items["stock:US:NVDA"]!.map((n) => n.title)).toEqual(["Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit"]);
  });
});
