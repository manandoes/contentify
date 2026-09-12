/**
 * Pure Phase 14 helpers for shaping the Performance Agent's INPUT (Rules.md
 * §4: "historical posts with platform, content type, hook, topic, format,
 * publish time and metrics"), kept dependency-free so the shaping decisions
 * are unit-testable without a database — same split as services/analyticsView.ts.
 */
import type { AnalyticsRow } from "./analyticsView";

export interface HistoryMetrics {
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
}

/** "Not fetched yet" (no row at all) and "fetched, not exposed" (a null field) both surface as null here — Rules.md §4: never guess. */
export function metricsFromAnalyticsRow(row: AnalyticsRow | undefined): HistoryMetrics {
  return {
    impressions: row?.impressions ?? null,
    likes: row?.likes ?? null,
    comments: row?.comments ?? null,
    shares: row?.shares ?? null,
    saves: row?.saves ?? null,
    clicks: row?.clicks ?? null,
  };
}

/**
 * content_assets has no per-platform/per-post link (Phase 8 schema), so
 * this can only say what kind of media the content as a whole carried, not
 * which formatted variant a given platform actually used. "text" when no
 * asset was ever attached; otherwise the original asset's type.
 */
export function deriveFormat(assetTypes: string[]): string {
  return assetTypes[0] ?? "text";
}

export interface HistoricalPost {
  platform: string;
  contentType: string;
  hook: string | null;
  topic: string;
  format: string;
  publishedAt: string | null;
  metrics: HistoryMetrics;
}

export function buildPerformanceHistoryInput(posts: HistoricalPost[]): { posts: unknown[] } {
  return {
    posts: posts.map((post) => ({
      platform: post.platform,
      content_type: post.contentType,
      hook: post.hook,
      topic: post.topic,
      format: post.format,
      published_at: post.publishedAt,
      metrics: post.metrics,
    })),
  };
}
