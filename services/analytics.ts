/**
 * Phase 13 — pulls whatever each connected platform actually exposes for a
 * real published post and stores it (Architecture.md §1: "Analytics (pulls
 * whatever each platform actually exposes)"). Both callers — the
 * /api/analytics cron route and the founder's "Refresh now" button — come
 * through here, same reasoning as services/publisher.ts.
 *
 * Never branches on platform: connectors/index.ts hands back a
 * PlatformConnector whose getAnalytics() already returns null per-field for
 * anything that platform doesn't expose (Rules.md §4 — never guess).
 *
 * analytics has no unique constraint on published_post_id (Phase 1
 * migration) — it's an append-only time series, so this always inserts a
 * new row rather than updating one in place.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import { getConnector } from "@/connectors";
import type { PlatformAnalytics } from "@/connectors/base";
import type { Database } from "@/types/database";

export type AnalyticsFetchResult =
  | { outcome: "FETCHED"; publishedPostId: string; metrics: PlatformAnalytics }
  | { outcome: "SKIPPED"; publishedPostId: string; reason: string }
  | { outcome: "FAILED"; publishedPostId: string; error: string };

export async function fetchAnalyticsForPost(
  publishedPostId: string,
  db: SupabaseClient<Database> = supabaseServer(),
): Promise<AnalyticsFetchResult> {
  const { data, error } = await db
    .from("published_posts")
    .select("id, platform, platform_post_id, status")
    .eq("id", publishedPostId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load published post ${publishedPostId}: ${error.message}`);
  if (!data) return { outcome: "SKIPPED", publishedPostId, reason: "That published post no longer exists." };
  if (data.status !== "PUBLISHED") {
    return { outcome: "SKIPPED", publishedPostId, reason: `Not published via a platform API (status: ${data.status}) — nothing to fetch.` };
  }
  if (!data.platform_post_id) {
    return { outcome: "SKIPPED", publishedPostId, reason: "No platform post id on file — nothing to fetch." };
  }

  let metrics: PlatformAnalytics;
  try {
    metrics = await getConnector(data.platform, db).getAnalytics(data.platform_post_id);
  } catch (err) {
    return { outcome: "FAILED", publishedPostId, error: err instanceof Error ? err.message : String(err) };
  }

  const { error: insertError } = await db.from("analytics").insert({
    published_post_id: publishedPostId,
    impressions: metrics.impressions,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    saves: metrics.saves,
    clicks: metrics.clicks,
    fetched_at: metrics.fetchedAt,
  });
  if (insertError) throw new Error(`Fetched analytics for ${publishedPostId}, but failed to store them: ${insertError.message}`);

  return { outcome: "FETCHED", publishedPostId, metrics };
}

/**
 * Every published post a platform API actually confirmed (status='PUBLISHED'
 * with a platform_post_id) — a manual READY_TO_POST row has no platform API
 * behind it to ask, so it is never a candidate here. Serial, not parallel:
 * same reasoning as publishDuePosts — rate-limited platform APIs, low daily
 * volume, no need for the concurrency.
 */
export async function fetchAllPendingAnalytics(db: SupabaseClient<Database> = supabaseServer()): Promise<AnalyticsFetchResult[]> {
  const { data, error } = await db
    .from("published_posts")
    .select("id")
    .eq("status", "PUBLISHED")
    .not("platform_post_id", "is", null);

  if (error) throw new Error(`Failed to load published posts for analytics: ${error.message}`);

  const results: AnalyticsFetchResult[] = [];
  for (const row of data ?? []) {
    results.push(await fetchAnalyticsForPost(row.id, db));
  }
  return results;
}
