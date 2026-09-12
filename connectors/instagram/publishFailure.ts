/**
 * The decision logic behind connectors/instagram/index.ts's failureFrom(),
 * freshCredentials(), and awaitContainerReady(), pulled out for the same
 * reason as connectors/linkedin/publishFailure.ts: Phase 16's failure-path
 * suite needs to exercise "expired token" and "invalid media" without going
 * through index.ts's "server-only" import or its parameter-property
 * PublishFailure class, neither of which node's type-stripping test runner
 * can load.
 */

export interface FailureClassification {
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  /** True when the caller should mark the Instagram connection broken (Rules.md §3 "Token expired"). */
  broken: boolean;
}

/**
 * Rules.md §3, three rows at once. Meta signals rate limiting with its own
 * error codes (4 = app-level, 17 = user-level, 32/613 = page/call-count) far
 * more often than with HTTP 429, so the code is checked too, not just the
 * status. 190 is "token invalid or expired" — terminal for this attempt.
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export function classifyInstagramFailure(
  status: number,
  code: number | null,
  detail: string,
  retryAfterHeader: string | null,
): FailureClassification {
  if (status === 429 || (code !== null && RATE_LIMIT_CODES.has(code))) {
    const retryAfter = Number(retryAfterHeader);
    return {
      message: `Instagram rate limit hit: ${detail}`,
      retryable: true,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      broken: false,
    };
  }

  if (status === 401 || code === 190) {
    return { message: `Instagram rejected the access token: ${detail}. Reconnect Instagram in Settings.`, retryable: false, broken: true };
  }

  return { message: `Instagram API error: ${detail}`, retryable: status >= 500, broken: false };
}

export type InstagramExpiryState = "fresh" | "needs_refresh" | "unrecoverable";

/**
 * Whether a publish attempt should refresh the access token first, and
 * whether refreshing is even still possible. Instagram only extends a token
 * that is still alive, so past expiry there is nothing to refresh —
 * "unrecoverable" mirrors freshCredentials()'s `expiresAt <= Date.now()`
 * branch, which marks the connection broken immediately rather than
 * attempting a refresh call doomed to fail.
 */
export function instagramExpiryState(expiresAt: string | null, now: number, refreshWindowMs: number): InstagramExpiryState {
  if (expiresAt === null) return "fresh";
  const expiresAtMs = Date.parse(expiresAt);
  if (expiresAtMs - now >= refreshWindowMs) return "fresh";
  return expiresAtMs <= now ? "unrecoverable" : "needs_refresh";
}

export type ContainerOutcome =
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "expired" }
  | { kind: "waiting" };

/**
 * Rules.md §3 "Invalid media": a container that finishes with ERROR means
 * Instagram could not process the image — terminal, the same image fails
 * identically next time. EXPIRED means the upload aged out before it could
 * be published, which is safe to retry with a fresh container.
 */
export function classifyContainerStatus(statusCode: string | undefined, status: string | undefined): ContainerOutcome {
  switch (statusCode) {
    case "FINISHED":
      return { kind: "ready" };
    case "ERROR":
      return {
        kind: "error",
        message: `Instagram could not process the image for this post${status ? ` (${status})` : ""}. Check the media and try again.`,
      };
    case "EXPIRED":
      return { kind: "expired" };
    default:
      return { kind: "waiting" };
  }
}
