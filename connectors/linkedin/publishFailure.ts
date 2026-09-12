/**
 * The decision logic behind connectors/linkedin/index.ts's failureFrom() and
 * freshCredentials(), pulled out so Phase 16's failure-path suite
 * (Phases.md Phase 16, Implementationplan.md Block F: "expired token ...
 * duplicate publish") can exercise it directly. index.ts still owns every
 * side effect (reading the response body, calling markBroken, refreshing) —
 * this file only decides what those side effects should be, given plain
 * values, so it carries none of index.ts's "server-only" or
 * parameter-property-class baggage that keeps it out of node's
 * type-stripping test runner.
 */

export interface FailureClassification {
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  /** True when the caller should mark the LinkedIn connection broken (Rules.md §3 "Token expired"). */
  broken: boolean;
}

/**
 * Rules.md §3, three rows at once: 5xx is "API is down" (retry with backoff),
 * 429 is "rate limit hit" (respect retry-after, queue for later), and 401
 * means the token died mid-flight — terminal for this attempt, and the
 * connection needs to be marked broken so the founder re-auths.
 */
export function classifyLinkedInFailure(status: number, detail: string, retryAfterHeader: string | null): FailureClassification {
  if (status === 429) {
    const retryAfter = Number(retryAfterHeader);
    return {
      message: `LinkedIn rate limit hit: ${detail}`,
      retryable: true,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      broken: false,
    };
  }

  if (status === 401) {
    return { message: `LinkedIn rejected the access token: ${detail}. Reconnect LinkedIn in Settings.`, retryable: false, broken: true };
  }

  return { message: `LinkedIn API error: ${detail}`, retryable: status >= 500, broken: false };
}

export type LinkedInExpiryState = "fresh" | "needs_refresh";

/**
 * Whether a publish attempt should refresh the access token first. Mirrors
 * freshCredentials()'s `expiringSoon` check exactly: a null expiry (LinkedIn
 * didn't report one) is treated as fresh rather than forced through a
 * refresh it may not support.
 */
export function linkedInExpiryState(expiresAt: string | null, now: number, refreshWindowMs: number): LinkedInExpiryState {
  if (expiresAt === null) return "fresh";
  return Date.parse(expiresAt) - now < refreshWindowMs ? "needs_refresh" : "fresh";
}
