/**
 * Phase 16 (Phases.md: "force a timeout mid-publish"; Implementationplan.md
 * Block F: "mid-publish timeout"). Both connectors/linkedin/index.ts and
 * connectors/instagram/index.ts catch a thrown network error (timeout, DNS
 * failure, connection reset — anything that isn't a classified
 * PublishFailure) around their publish() call, and both need to answer it
 * identically: the request never definitively completed, so whether the
 * platform actually created the post is unknown, and with no platform-side
 * idempotency (see services/publisher.ts's published_posts guard) a blind
 * retry could double-post. Rules.md §3's "never retry blindly without
 * confirming the previous attempt's real outcome" means this is never
 * retryable — the founder checks the platform feed and decides.
 *
 * Pulled out from both connectors (rather than duplicated) so this one
 * invariant — a timeout must never come back retryable — has one
 * implementation and can be unit-tested directly. Every runtime import in
 * connectors/linkedin/index.ts and connectors/instagram/index.ts is either
 * "server-only" or a parameter-property class, neither of which node's
 * type-stripping test runner can load (see tests/failurePaths.test.ts);
 * this file has no such import, so it can be.
 */
import type { PublishResult } from "./base.ts";

export function networkErrorResult(platformLabel: string, error: unknown): Extract<PublishResult, { status: "FAILED" }> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "FAILED",
    error: `Could not reach ${platformLabel} (${message}) — check the ${platformLabel} feed before retrying, the post may or may not have gone out.`,
    retryable: false,
  };
}
