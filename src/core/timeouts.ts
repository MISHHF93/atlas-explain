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

/**
 * A server-side failure that usually passes on its own (HTTP 500, 502, 503 or 504, "internal",
 * "unavailable", "overloaded"); never a quota, sign-in, security-check or bad-request error.
 */
export function isTemporaryCloudError(message: string): boolean {
  if (/quota|resource.?exhausted|\b429\b|rate.?limit|api.?key|app.?check|recaptcha|unauthenticated|permission|invalid|\b400\b|\b403\b/i.test(message)) return false;
  return /\b(500|502|503|504)\b|internal error|\binternal\b|unavailable|overloaded|backend error/i.test(message);
}

/** Plain-language copy for cloud failures in the web app. */
export function cloudErrorCopy(message: string): string {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return "Cloud answers are unavailable because of a problem on our side. Answers on this device still work.";
  if (/throttl/i.test(message)) {
    return "Our security check paused cloud answers in this browser. Reload the page to try again. Answers on this device still work.";
  }
  if (/app.?check|recaptcha|attestation|unauthenticated/i.test(message)) {
    return "Our security check couldn't confirm this browser. Reload the page and try again. Answers on this device still work.";
  }
  // Only a real quota or rate limit: every SDK error names "generateContent", which contains "rate".
  if (/quota|resource.?exhausted|\b429\b|rate.?limit|too many requests/i.test(message)) return "The cloud is busy right now. Wait a minute and try again. Answers on this device still work.";
  if (/deadline|timed? ?out|took too long/i.test(message)) return "The answer took too long, so we stopped waiting. Try again; shorter questions finish faster.";
  if (isTemporaryCloudError(message)) return "The cloud had a temporary problem on Google's side. Try again in a moment. Answers on this device still work.";
  // "Error fetching from …" begins every SDK error, so only real connection failures count here.
  if (/failed to fetch|network ?error|offline|err_internet|err_network|load failed/i.test(message)) return "We couldn't reach the cloud. Check your connection and try again.";
  // Never show raw SDK or server text to the public.
  return "Something went wrong while writing the answer. Try again in a moment.";
}
