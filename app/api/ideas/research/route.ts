/**
 * Phase 3, stage 1 — polled once daily by .github/workflows/daily-ideas.yml.
 * Turns recent raw_signals + tracked_competitors into up to 3 ranked,
 * evidence-backed briefs. Every returned opening has already passed the
 * Researcher's own competitor-recency gate (Rules.md §4), so all of them
 * are inserted as briefs.status='promoted' — nothing further vets them
 * here.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runAgent } from "@/lib/gemini";
import { findRelatedMemories } from "@/services/contentMemory";
import { getBrandId, nextStepOrder, resolveRunId } from "@/services/orchestrator";
import { researcherOutputSchema } from "@/types/agents";
import type { Json } from "@/types/database";

const GENERAL_SIGNALS_WINDOW_MS = 48 * 60 * 60 * 1000;
const COMPETITOR_SIGNALS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const GENERAL_SIGNALS_LIMIT = 150;
const COOLDOWN_BRIEF_COUNT = 5;
// Phase 14: how many of today's highest-engagement signals stand in for
// "what this run is about" when the founder didn't write build-log notes —
// keeps the content_memory query to one embedding call regardless of how
// many signals were collected (see findRelatedMemories's own header).
const MEMORY_QUERY_SIGNAL_COUNT = 15;

interface RequestBody {
  runId?: string;
  buildLogNotes?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const runId = resolveRunId(body.runId);
  const buildLogNotes = body.buildLogNotes ?? "";

  const db = supabaseServer();
  const brandId = await getBrandId(db);

  const [generalSignals, competitorSignals, competitors, cooldownBriefs] = await Promise.all([
    db
      .from("raw_signals")
      .select("source, source_kind, title, url, raw_content, engagement_score, fetched_at")
      .is("competitor_id", null)
      .gte("fetched_at", new Date(Date.now() - GENERAL_SIGNALS_WINDOW_MS).toISOString())
      .order("fetched_at", { ascending: false })
      .limit(GENERAL_SIGNALS_LIMIT),
    db
      .from("raw_signals")
      .select("source, source_kind, competitor_id, title, url, raw_content, engagement_score, fetched_at")
      .not("competitor_id", "is", null)
      .gte("fetched_at", new Date(Date.now() - COMPETITOR_SIGNALS_WINDOW_MS).toISOString())
      .order("fetched_at", { ascending: false }),
    db.from("tracked_competitors").select("id, name, platform, handle_or_url, manual_only"),
    db
      .from("briefs")
      .select("angle_type")
      .order("created_at", { ascending: false })
      .limit(COOLDOWN_BRIEF_COUNT),
  ]);

  for (const [name, result] of [
    ["raw_signals (general)", generalSignals],
    ["raw_signals (competitor)", competitorSignals],
    ["tracked_competitors", competitors],
    ["briefs (cooldown)", cooldownBriefs],
  ] as const) {
    if (result.error) {
      return NextResponse.json({ error: `Failed to load ${name}: ${result.error.message}` }, { status: 500 });
    }
  }

  // Phase 14: repoints part of the cooldown check from a flat "last 5
  // angle_types" list to real semantic history. The query text is the
  // build-log notes when the founder wrote any, else today's highest-
  // engagement signal titles — either way, one embedding call, not one per
  // signal.
  const memoryQueryText =
    buildLogNotes.trim() ||
    [...(generalSignals.data ?? [])]
      .sort((a, b) => (b.engagement_score ?? 0) - (a.engagement_score ?? 0))
      .slice(0, MEMORY_QUERY_SIGNAL_COUNT)
      .map((signal) => signal.title)
      .join("\n");

  const relatedMemories = await findRelatedMemories(db, brandId, memoryQueryText);

  const input: Json = {
    build_log_notes: buildLogNotes,
    general_signals: generalSignals.data ?? [],
    competitor_signals: competitorSignals.data ?? [],
    tracked_competitors: competitors.data ?? [],
    cooldown_angle_types: (cooldownBriefs.data ?? []).map((b) => b.angle_type),
    content_memory: relatedMemories.map((memory) => ({
      topic_summary: memory.topicSummary,
      angle_type: memory.angleType,
      performance_score: memory.performanceScore,
      similarity: memory.similarity,
    })),
  };

  const stepOrder = await nextStepOrder(db, runId);
  const output = await runAgent({
    runId,
    agentName: "researcher",
    stepOrder,
    promptFile: "researcher.md",
    input,
    schema: researcherOutputSchema,
    inheritsSharedRules: false,
  });

  if (output.openings.length === 0) {
    return NextResponse.json({ runId, brandId, briefs: [] });
  }

  const rows = output.openings.map((opening) => ({
    brand_id: brandId,
    run_id: runId,
    opening: opening.opening,
    angle_type: opening.angle_type,
    evidence: opening.evidence as Json,
    competitor_recency: opening.competitor_recency,
    competitor_note: opening.competitor_note ?? null,
    performance_note: opening.performance_note ?? null,
    score: opening.score as Json,
    rank: opening.rank,
    status: "promoted",
  }));

  const { data: inserted, error: insertError } = await db.from("briefs").insert(rows).select("id, rank, opening, competitor_recency");

  if (insertError) {
    return NextResponse.json({ error: `Failed to insert briefs: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ runId, brandId, briefs: inserted });
}
