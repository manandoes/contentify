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
  | { status: "FAILED"; error: string };

export type PostStatus =
  | { status: "live" | "pending" }
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
