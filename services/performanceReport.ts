/**
 * Phase 14 — Performance Agent (agents/performanceAgent.md, Rules.md §4).
 * Reads every real published post this brand has, once, and writes one
 * performance_reports row. Extracted from its route the same way
 * services/contentGenerator.ts is, so a future caller (e.g. a "Run now"
 * button) doesn't have to duplicate this query.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "@/lib/gemini";
import { latestAnalyticsByPost } from "@/services/analyticsView";
import { extractTopicSummary } from "@/services/contentMemoryView";
import { getBrandId, nextStepOrder, resolveRunId } from "@/services/orchestrator";
import { buildPerformanceHistoryInput, deriveFormat, metricsFromAnalyticsRow, type HistoricalPost } from "@/services/performanceReportView";
import { performanceAgentOutputSchema, type PerformanceAgentOutput } from "@/types/agents";
import type { Database, Json } from "@/types/database";

type PublishedPostRow = {
  id: string;
  platform: string;
  published_at: string | null;
  content_versions: {
    caption: Json | null;
    content: {
      id: string;
      content_type: string;
      title: string;
      analysis: Json | null;
    };
  };
};

export type PerformanceReportResult =
  | { skipped: true; reason: string }
  | { skipped: false; runId: string; reportId: string; output: PerformanceAgentOutput };

export async function runPerformanceAgent(db: SupabaseClient<Database>, providedRunId?: string): Promise<PerformanceReportResult> {
  const brandId = await getBrandId(db);

  const { data: postRows, error: postsError } = await db
    .from("published_posts")
    .select("id, platform, published_at, content_versions!inner(caption, content:content_id!inner(id, content_type, title, analysis, brand_id))")
    .eq("status", "PUBLISHED")
    .eq("content_versions.content.brand_id", brandId)
    .returns<PublishedPostRow[]>();

  if (postsError) throw new Error(`Failed to load published posts for performance report: ${postsError.message}`);
  if (!postRows || postRows.length === 0) {
    return { skipped: true, reason: "No published posts yet — nothing for the Performance Agent to analyze." };
  }

  const contentIds = [...new Set(postRows.map((row) => row.content_versions.content.id))];
  const { data: assetRows, error: assetsError } = await db
    .from("content_assets")
    .select("content_id, asset_type, is_original")
    .in("content_id", contentIds);
  if (assetsError) throw new Error(`Failed to load content_assets for performance report: ${assetsError.message}`);

  const assetTypesByContentId = new Map<string, string[]>();
  for (const asset of assetRows ?? []) {
    const types = assetTypesByContentId.get(asset.content_id) ?? [];
    if (asset.is_original) types.unshift(asset.asset_type);
    else types.push(asset.asset_type);
    assetTypesByContentId.set(asset.content_id, types);
  }

  const { data: analyticsRows, error: analyticsError } = await db
    .from("analytics")
    .select("*")
    .in(
      "published_post_id",
      postRows.map((row) => row.id),
    );
  if (analyticsError) throw new Error(`Failed to load analytics for performance report: ${analyticsError.message}`);
  const latestAnalytics = latestAnalyticsByPost(analyticsRows ?? []);

  const historicalPosts: HistoricalPost[] = postRows.map((row) => {
    const content = row.content_versions.content;
    const caption = row.content_versions.caption as { hook?: string } | null;
    return {
      platform: row.platform,
      contentType: content.content_type,
      hook: caption?.hook ?? null,
      topic: extractTopicSummary(content.analysis, content.title),
      format: deriveFormat(assetTypesByContentId.get(content.id) ?? []),
      publishedAt: row.published_at,
      metrics: metricsFromAnalyticsRow(latestAnalytics.get(row.id)),
    };
  });

  const runId = resolveRunId(providedRunId);
  const stepOrder = await nextStepOrder(db, runId);
  const output = await runAgent({
    runId,
    agentName: "performanceAgent",
    stepOrder,
    promptFile: "performanceAgent.md",
    input: buildPerformanceHistoryInput(historicalPosts) as Json,
    schema: performanceAgentOutputSchema,
  });

  const { data: report, error: insertError } = await db
    .from("performance_reports")
    .insert({
      brand_id: brandId,
      run_id: runId,
      observed: output.observed as Json,
      interpretation: output.interpretation as Json,
      recommendations: output.recommendations as Json,
      next_test: output.next_test,
    })
    .select("id")
    .single();

  if (insertError || !report) {
    throw new Error(`Failed to save performance_reports row: ${insertError?.message}`);
  }

  return { skipped: false, runId, reportId: report.id, output };
}
