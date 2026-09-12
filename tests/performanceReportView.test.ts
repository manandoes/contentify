/**
 * Phase 14 — shaping decisions for the Performance Agent's input. The bug
 * this guards against: silently turning "no analytics row yet" into a
 * measured zero, which would make an unfetched post look like it flopped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceHistoryInput, deriveFormat, metricsFromAnalyticsRow } from "../services/performanceReportView.ts";
import type { AnalyticsRow } from "../services/analyticsView.ts";

test("metricsFromAnalyticsRow is all-null when no row was ever fetched", () => {
  const metrics = metricsFromAnalyticsRow(undefined);
  assert.deepEqual(metrics, { impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: null });
});

test("metricsFromAnalyticsRow preserves a fetched row's own nulls (platform doesn't expose that field)", () => {
  const row: AnalyticsRow = {
    id: "a1",
    published_post_id: "post-1",
    fetched_at: "2026-09-12T00:00:00Z",
    impressions: 500,
    likes: 20,
    comments: null,
    shares: null,
    saves: 3,
    clicks: null,
  };
  assert.deepEqual(metricsFromAnalyticsRow(row), {
    impressions: 500,
    likes: 20,
    comments: null,
    shares: null,
    saves: 3,
    clicks: null,
  });
});

test("deriveFormat defaults to text when the content has no media assets", () => {
  assert.equal(deriveFormat([]), "text");
});

test("deriveFormat uses the original asset's type when one exists", () => {
  assert.equal(deriveFormat(["image", "image"]), "image");
});

test("buildPerformanceHistoryInput maps every field to the agent's snake_case shape", () => {
  const { posts } = buildPerformanceHistoryInput([
    {
      platform: "linkedin",
      contentType: "text",
      hook: "Nobody tells you this about pre-launch",
      topic: "Why founders ship too late",
      format: "image",
      publishedAt: "2026-09-01T00:00:00Z",
      metrics: { impressions: 100, likes: 10, comments: null, shares: null, saves: null, clicks: null },
    },
  ]);

  assert.deepEqual(posts, [
    {
      platform: "linkedin",
      content_type: "text",
      hook: "Nobody tells you this about pre-launch",
      topic: "Why founders ship too late",
      format: "image",
      published_at: "2026-09-01T00:00:00Z",
      metrics: { impressions: 100, likes: 10, comments: null, shares: null, saves: null, clicks: null },
    },
  ]);
});
