/**
 * Phase 14 — the pure scoring/formatting decisions behind content_memory,
 * same reasoning as tests/analyticsView.test.ts-style coverage: these are
 * cheap to get subtly wrong (e.g. treating "no analytics yet" as a score of
 * zero) and cheap to unit-test in isolation from Supabase/Gemini.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePerformanceScores,
  computePerformanceScore,
  extractTopicSummary,
  toVectorLiteral,
} from "../services/contentMemoryView.ts";
import type { AnalyticsRow } from "../services/analyticsView.ts";

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    published_post_id: "post-1",
    fetched_at: "2026-09-12T00:00:00Z",
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
    ...overrides,
  };
}

test("computePerformanceScore returns null when there is no row at all", () => {
  assert.equal(computePerformanceScore(undefined), null);
});

test("computePerformanceScore returns null when every metric is null (fetched, nothing exposed)", () => {
  assert.equal(computePerformanceScore(row()), null);
});

test("computePerformanceScore treats a genuine zero as data, not as missing", () => {
  const score = computePerformanceScore(row({ likes: 0, comments: 0 }));
  assert.equal(score, 0);
});

test("computePerformanceScore combines only the metrics that are present", () => {
  const score = computePerformanceScore(row({ likes: 10, comments: 5 }));
  assert.equal(score, 10 * 1 + 5 * 2);
});

test("aggregatePerformanceScores ignores platforms with no data yet", () => {
  assert.equal(aggregatePerformanceScores([null, 10, null, 20]), 15);
});

test("aggregatePerformanceScores returns null when nothing has any data", () => {
  assert.equal(aggregatePerformanceScores([null, null]), null);
});

test("extractTopicSummary prefers the Content Analyzer's core_idea", () => {
  assert.equal(extractTopicSummary({ core_idea: "Why founders ship too late" }, "Untitled draft"), "Why founders ship too late");
});

test("extractTopicSummary falls back to the title when analysis is missing or empty", () => {
  assert.equal(extractTopicSummary(null, "Untitled draft"), "Untitled draft");
  assert.equal(extractTopicSummary({ core_idea: "" }, "Untitled draft"), "Untitled draft");
  assert.equal(extractTopicSummary({}, "Untitled draft"), "Untitled draft");
});

test("toVectorLiteral matches pgvector's text input format", () => {
  assert.equal(toVectorLiteral([0.1, -0.2, 3]), "[0.1,-0.2,3]");
});
