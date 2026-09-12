/**
 * Pure reducer over analytics rows, kept dependency-free (no supabase, no
 * "server-only") so it's unit-testable in isolation — same split as
 * services/approvalWorkflow.ts vs. services/publisher.ts.
 *
 * analytics has no unique constraint on published_post_id (Phase 1
 * migration): it's an append-only time series, one row per fetch. The
 * dashboard wants one row per post, and this is the "which one" decision.
 */
import type { Database } from "@/types/database";

export type AnalyticsRow = Database["public"]["Tables"]["analytics"]["Row"];

/**
 * Reduces a set of analytics rows (any order, possibly several snapshots per
 * post) down to the most recent row per published_post_id. The dashboard
 * needs this distinction because "no row yet" (never fetched) and "a row
 * with a null field" (fetched, platform doesn't expose it) are different
 * facts — collapsing them would be exactly the guessed certainty Rules.md
 * §4 forbids.
 */
export function latestAnalyticsByPost(rows: AnalyticsRow[]): Map<string, AnalyticsRow> {
  const latest = new Map<string, AnalyticsRow>();
  for (const row of rows) {
    const current = latest.get(row.published_post_id);
    if (!current || row.fetched_at > current.fetched_at) {
      latest.set(row.published_post_id, row);
    }
  }
  return latest;
}
