/**
 * Phase 14 — "embed published posts into content_memory (pgvector);
 * repoint the Researcher's cooldown to vector similarity"
 * (Implementationplan.md Block F).
 *
 * Two responsibilities, both against content_memory:
 *
 * - syncContentMemory(): the impure half of the feedback loop. For every
 *   piece of content with at least one real (platform-API) publish, upsert
 *   one content_memory row — topic_summary + angle_type from the content
 *   and its originating brief, performance_score from whatever analytics
 *   exist so far (services/contentMemoryView.ts's computePerformanceScore,
 *   null until something is fetched), and an embedding of topic_summary.
 *   Safe to re-run on a schedule: upserts on content_id (Phase 14
 *   migration's unique index), so a later run just refreshes the score and
 *   embedding in place.
 *
 * - findRelatedMemories(): what app/api/ideas/research/route.ts calls to
 *   give the Researcher real history instead of only the last 5
 *   briefs.angle_type. One embedding call + one match_content_memory() RPC
 *   call per research run — not one per raw signal — keeping this cheap
 *   regardless of how many signals were collected that day.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/gemini";
import { latestAnalyticsByPost } from "@/services/analyticsView";
import { aggregatePerformanceScores, computePerformanceScore, extractTopicSummary, toVectorLiteral } from "@/services/contentMemoryView";
import type { Database, Json } from "@/types/database";

type PublishedContentRow = {
  id: string;
  content_versions: {
    content: {
      id: string;
      brand_id: string;
      title: string;
      analysis: Json | null;
      source_brief_id: string | null;
    };
  };
};

export interface SyncContentMemoryResult {
  processed: number;
  embedded: number;
  skipped: number;
}

export async function syncContentMemory(db: SupabaseClient<Database>): Promise<SyncContentMemoryResult> {
  const { data: postRows, error: postsError } = await db
    .from("published_posts")
    .select("id, content_versions!inner(content:content_id!inner(id, brand_id, title, analysis, source_brief_id))")
    .eq("status", "PUBLISHED")
    .returns<PublishedContentRow[]>();

  if (postsError) throw new Error(`Failed to load published posts for content_memory sync: ${postsError.message}`);
  if (!postRows || postRows.length === 0) return { processed: 0, embedded: 0, skipped: 0 };

  const { data: analyticsRows, error: analyticsError } = await db
    .from("analytics")
    .select("*")
    .in(
      "published_post_id",
      postRows.map((row) => row.id),
    );
  if (analyticsError) throw new Error(`Failed to load analytics for content_memory sync: ${analyticsError.message}`);
  const latestAnalytics = latestAnalyticsByPost(analyticsRows ?? []);

  interface ContentGroup {
    brandId: string;
    title: string;
    analysis: Json | null;
    sourceBriefId: string | null;
    scores: (number | null)[];
  }
  const contentGroups = new Map<string, ContentGroup>();
  for (const post of postRows) {
    const content = post.content_versions.content;
    const group = contentGroups.get(content.id) ?? {
      brandId: content.brand_id,
      title: content.title,
      analysis: content.analysis,
      sourceBriefId: content.source_brief_id,
      scores: [],
    };
    group.scores.push(computePerformanceScore(latestAnalytics.get(post.id)));
    contentGroups.set(content.id, group);
  }

  const briefIds = [...new Set([...contentGroups.values()].map((g) => g.sourceBriefId).filter((id): id is string => id !== null))];
  const angleTypeByBriefId = new Map<string, string>();
  if (briefIds.length > 0) {
    const { data: briefs, error: briefsError } = await db.from("briefs").select("id, angle_type").in("id", briefIds);
    if (briefsError) throw new Error(`Failed to load briefs for content_memory sync: ${briefsError.message}`);
    for (const brief of briefs ?? []) angleTypeByBriefId.set(brief.id, brief.angle_type);
  }

  const contentIds = [...contentGroups.keys()];
  const topicSummaries = contentIds.map((id) => {
    const group = contentGroups.get(id)!;
    return extractTopicSummary(group.analysis, group.title);
  });
  const embeddings = await embedTexts(topicSummaries);

  const rows: Database["public"]["Tables"]["content_memory"]["Insert"][] = [];
  let skipped = 0;
  contentIds.forEach((contentId, i) => {
    const embedding = embeddings[i];
    if (!embedding) {
      skipped += 1;
      return;
    }
    const group = contentGroups.get(contentId)!;
    rows.push({
      brand_id: group.brandId,
      content_id: contentId,
      topic_summary: topicSummaries[i],
      angle_type: group.sourceBriefId ? (angleTypeByBriefId.get(group.sourceBriefId) ?? null) : null,
      performance_score: aggregatePerformanceScores(group.scores),
      embedding: toVectorLiteral(embedding),
    });
  });

  if (rows.length > 0) {
    const { error: upsertError } = await db.from("content_memory").upsert(rows, { onConflict: "content_id" });
    if (upsertError) throw new Error(`Failed to upsert content_memory: ${upsertError.message}`);
  }

  return { processed: contentIds.length, embedded: rows.length, skipped };
}

export interface RelatedMemory {
  contentId: string | null;
  topicSummary: string;
  angleType: string | null;
  performanceScore: number | null;
  similarity: number;
}

/**
 * One embedding + one nearest-neighbour RPC call (match_content_memory,
 * Phase 14 migration) against a single query text representing "what today's
 * research run is about" — see app/api/ideas/research/route.ts for how that
 * text is built. minSimilarity keeps unrelated old topics out of the
 * agent's input rather than padding it with noise.
 */
export async function findRelatedMemories(
  db: SupabaseClient<Database>,
  brandId: string,
  queryText: string,
  opts: { matchCount?: number; minSimilarity?: number } = {},
): Promise<RelatedMemory[]> {
  const { matchCount = 8, minSimilarity = 0.72 } = opts;
  if (!queryText.trim()) return [];

  const [embedding] = await embedTexts([queryText]);
  if (!embedding) return [];

  const { data, error } = await db.rpc("match_content_memory", {
    query_embedding: toVectorLiteral(embedding),
    match_brand_id: brandId,
    match_count: matchCount,
  });
  if (error) throw new Error(`content_memory similarity search failed: ${error.message}`);

  return (data ?? [])
    .filter((row) => row.similarity >= minSimilarity)
    .map((row) => ({
      contentId: row.content_id,
      topicSummary: row.topic_summary,
      angleType: row.angle_type,
      performanceScore: row.performance_score,
      similarity: row.similarity,
    }));
}
