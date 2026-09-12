/**
 * Pure Phase 14 helpers, kept dependency-free (no supabase, no "server-only",
 * no Gemini client) so they're unit-testable in isolation — same split as
 * services/analyticsView.ts vs. services/analytics.ts.
 */
import type { AnalyticsRow } from "./analyticsView";

/**
 * A single derived number for content_memory.performance_score, used only
 * to rank/compare past topics for the Researcher (Phase 14) — never
 * presented as an observed platform metric, so the weights below are a
 * deliberate heuristic, not a claim about what any platform actually
 * reports. Rules.md §4's "never invent numbers" governs the metrics
 * themselves (analytics.*, always stored verbatim or null); this function
 * only combines numbers that are already on file.
 *
 * Returns null when every metric is null (nothing fetched yet) — that is a
 * different fact from "fetched, all zero" and must not collapse into 0.
 */
export function computePerformanceScore(row: AnalyticsRow | undefined): number | null {
  if (!row) return null;

  const weights: Record<"impressions" | "likes" | "comments" | "shares" | "saves" | "clicks", number> = {
    impressions: 0.01,
    likes: 1,
    comments: 2,
    shares: 3,
    saves: 2,
    clicks: 1,
  };

  let hasAnyMetric = false;
  let score = 0;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    const value = row[key];
    if (value !== null) {
      hasAnyMetric = true;
      score += value * weights[key];
    }
  }

  return hasAnyMetric ? score : null;
}

/** Average of the non-null per-platform scores for one piece of content; null if none had any data yet. */
export function aggregatePerformanceScores(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, s) => sum + s, 0) / present.length;
}

/** The topic-memory row's headline text: the Content Analyzer's core_idea when available, else the raw title. */
export function extractTopicSummary(analysis: unknown, title: string): string {
  if (analysis && typeof analysis === "object" && "core_idea" in analysis) {
    const coreIdea = (analysis as { core_idea?: unknown }).core_idea;
    if (typeof coreIdea === "string" && coreIdea.trim().length > 0) return coreIdea;
  }
  return title;
}

/** pgvector's text input/output format for a `vector` column, e.g. "[0.1,0.2,0.3]". */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
