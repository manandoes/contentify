/**
 * The one shape every platform connector implements (Architecture.md §6).
 * The rest of the app never needs to know which platform it's talking to;
 * adding a platform later is one new folder, not a change anywhere else.
 *
 * `connectors/manual.ts` is the default implementation for platforms with
 * no publishing API. It exists from day one specifically so the
 * READY_TO_POST fallback (Rules.md §1.3) is never a special case bolted on
 * later — every connector, real or manual, satisfies this same contract.
 */
import type { Platform } from "@/types/enums";

export type ConnectionStatus =
  | { ok: true }
  | { ok: false; reason: string };

export interface PublishableContent {
  contentVersionId: string;
  platform: Platform;
  caption: {
    hook: string;
    body: string;
    cta: string | null;
    hashtags: string[];
    firstComment: string | null;
  };
  mediaUrls: string[];
  /** Rules.md §3 — checked before every publish attempt; never retry blindly. */
  idempotencyKey: string;
}

export type PublishResult =
  | { status: "PUBLISHED"; platformPostId: string; publishedAt: string }
  | { status: "READY_TO_POST"; reason: "NOT_SUPPORTED" }
  /**
   * `retryable` separates "this attempt failed, the next one might not"
   * (platform 5xx, rate limit) from "this will fail identically forever"
   * (caption too long, scope missing). Rules.md §3 requires different
   * handling for each — back off and queue vs. mark FAILED now — so the
   * connector, which is the only thing that saw the platform's response,
   * is what decides. `retryAfterSeconds` carries a rate limiter's
   * `retry-after` so the caller never has to guess at it.
   */
  | { status: "FAILED"; error: string; retryable?: boolean; retryAfterSeconds?: number };

/**
 * Architecture.md §6 names live / pending / failed. `unknown` is the fourth
 * honest answer: some platforms gate *reading* a post behind a scope they
 * won't grant for publishing (LinkedIn's r_member_social), and reporting a
 * post we simply cannot see as "failed" would be exactly the kind of
 * invented certainty Rules.md §1.3 forbids.
 */
export type PostStatus =
  | { status: "live" | "pending" }
  | { status: "unknown"; reason: string }
  | { status: "failed"; error: string };

export interface PlatformAnalytics {
  /** Every metric a platform doesn't expose is null — never guessed (Rules.md §4 Performance Agent). */
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  fetchedAt: string;
}

export interface PlatformConnector {
  readonly platform: Platform;

  /** Are the stored credentials valid, with the scopes publishing needs? Checked at connection time, not publish time (Rules.md §3). */
  validateConnection(): Promise<ConnectionStatus>;

  /** Publish, or return { status: "READY_TO_POST", reason: "NOT_SUPPORTED" } — never fake success (Rules.md §1.3). */
  publish(content: PublishableContent): Promise<PublishResult>;

  getStatus(platformPostId: string): Promise<PostStatus>;

  /** Returns null per-field for anything this platform doesn't expose — never estimated. */
  getAnalytics(platformPostId: string): Promise<PlatformAnalytics>;
}
