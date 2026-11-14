/**
 * Every wait in ATLAS Explain ends. A spinner that never resolves is a bug, so slow
 * work races a deadline and turns into an honest message instead.
 */
export const EXPLAIN_DEADLINE_MS = 70_000;
export const DEVICE_INIT_DEADLINE_MS = 12_000;
export const SETTINGS_FETCH_TIMEOUT_MS = 6_000;

export class DeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineError";
  }
}

export function withDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(message)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Plain-language copy for cloud failures, shared by the web app and the extension. */
export function cloudErrorCopy(message: string, surface: "web" | "extension" = "web"): string {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return "Cloud answers are unavailable because of a problem on our side. Answers on this device still work.";
  if (/throttl/i.test(message)) {
    return surface === "web"
      ? "Our security check paused cloud answers in this browser. Reload the page to try again. Answers on this device still work."
      : "Our security check paused cloud answers for now. Close and reopen ATLAS Explain to try again. Answers on this device still work.";
  }
  if (/app.?check|recaptcha|attestation|unauthenticated/i.test(message)) {
    return surface === "web"
      ? "Our security check couldn't confirm this browser. Reload the page and try again. Answers on this device still work."
      : "Our security check couldn't confirm this browser. Try again in a moment. Answers on this device still work.";
  }
  if (/quota|resource.?exhausted|429|rate/i.test(message)) return "The cloud is busy right now. Wait a minute and try again. Answers on this device still work.";
  if (/deadline|timed? ?out|took too long/i.test(message)) return "The answer took too long, so we stopped waiting. Try again; shorter questions finish faster.";
  if (/network|fetch|offline|failed to fetch/i.test(message)) return "We couldn't reach the cloud. Check your connection and try again.";
  // Never show raw SDK or server text to the public.
  return "Something went wrong while writing the answer. Try again in a moment.";
}
