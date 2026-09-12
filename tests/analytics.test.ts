/**
 * latestAnalyticsByPost is the piece of Phase 13 worth unit-testing in
 * isolation: analytics is an append-only time series (no unique constraint
 * on published_post_id), so the dashboard's "one row per post" view depends
 * on this picking the right snapshot — same reasoning as
 * tests/approvalWorkflow.test.ts testing the pure decision logic rather than
 * the whole service.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { latestAnalyticsByPost } from "../services/analyticsView.ts";
import type { AnalyticsRow } from "../services/analyticsView.ts";

function row(overrides: Partial<AnalyticsRow> & Pick<AnalyticsRow, "published_post_id" | "fetched_at">): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
    ...overrides,
  };
}

test("no rows produces an empty map", () => {
  assert.equal(latestAnalyticsByPost([]).size, 0);
});

test("a single row is returned as-is", () => {
  const only = row({ published_post_id: "post-1", fetched_at: "2026-09-10T00:00:00Z", likes: 5 });
  const latest = latestAnalyticsByPost([only]);
  assert.equal(latest.get("post-1"), only);
});

test("picks the most recently fetched row per post, regardless of input order", () => {
  const older = row({ published_post_id: "post-1", fetched_at: "2026-09-10T00:00:00Z", likes: 5 });
  const newer = row({ published_post_id: "post-1", fetched_at: "2026-09-12T00:00:00Z", likes: 20 });

  assert.equal(latestAnalyticsByPost([older, newer]).get("post-1"), newer);
  assert.equal(latestAnalyticsByPost([newer, older]).get("post-1"), newer);
});

test("tracks the latest snapshot independently per post", () => {
  const post1 = row({ published_post_id: "post-1", fetched_at: "2026-09-10T00:00:00Z" });
  const post2 = row({ published_post_id: "post-2", fetched_at: "2026-09-11T00:00:00Z" });

  const latest = latestAnalyticsByPost([post1, post2]);
  assert.equal(latest.size, 2);
  assert.equal(latest.get("post-1"), post1);
  assert.equal(latest.get("post-2"), post2);
});

test("a null field in the latest row stays null — never backfilled from an older row", () => {
  const withLikes = row({ published_post_id: "post-1", fetched_at: "2026-09-10T00:00:00Z", likes: 5 });
  const withoutLikes = row({ published_post_id: "post-1", fetched_at: "2026-09-12T00:00:00Z", likes: null });

  const latest = latestAnalyticsByPost([withLikes, withoutLikes]);
  assert.equal(latest.get("post-1")?.likes, null);
});
