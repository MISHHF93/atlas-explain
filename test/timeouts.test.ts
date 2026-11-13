import { describe, expect, it } from "vitest";
import { DeadlineError, cloudErrorCopy, withDeadline } from "../src/core/timeouts";
import { shouldUseOnDevice } from "../extension/src/on-device";

describe("every wait ends", () => {
  it("resolves fast work and rejects slow work with a DeadlineError", async () => {
    await expect(withDeadline(Promise.resolve(1), 50, "slow")).resolves.toBe(1);
    await expect(withDeadline(new Promise(() => {}), 10, "slow")).rejects.toBeInstanceOf(DeadlineError);
  });

  it("only uses Nano when it is ready now, never while it downloads", () => {
    expect(shouldUseOnDevice("available")).toBe(true);
    for (const s of ["downloadable", "downloading", "unavailable", "no", "after-download"]) expect(shouldUseOnDevice(s)).toBe(false);
  });

  it("explains cloud failures in plain language without asking users for debug tokens", () => {
    const cases = [
      "AppCheck: Requests throttled due to previous 403 error. (appCheck/throttled)",
      "Firebase App Check token is invalid.",
      "App attestation failed.",
      "429 RESOURCE_EXHAUSTED quota",
      "The answer took too long.",
      "Failed to fetch",
    ];
    for (const m of cases) {
      for (const surface of ["web", "extension"] as const) {
        const copy = cloudErrorCopy(m, surface);
        expect(copy).not.toMatch(/debug token/i);
        expect(copy.length).toBeLessThan(200);
      }
    }
    expect(cloudErrorCopy("appCheck/throttled", "web")).toMatch(/Reload/);
  });
});
