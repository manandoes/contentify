/**
 * Phase 3, stage 3 — chained after /api/ideas/hooks by
 * .github/workflows/daily-ideas.yml. Auto-picks the #1-ranked promoted
 * brief with surviving hooks and finalizes its strongest (first) survivor
 * into one ingestion-ready seed post. No founder-selection UI exists yet
 * (that's Phase 9's approval dashboard) — the founder reviews all 3 briefs
 * on /ideas, but only the top one is carried through automatically today.
 * The resulting object is NOT written to `content` — that insert is Phase
 * 5's /api/content/ingest job (Architecture.md keeps idea-finalizer output
 * and content ingestion as separate boxes).
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runAgent } from "@/lib/gemini";
import { nextStepOrder } from "@/services/orchestrator";
import { ideaFinalizerOutputSchema } from "@/types/agents";
import type { Json } from "@/types/database";

interface RequestBody {
  runId: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }
  const { runId } = body;

  const db = supabaseServer();

  const { data: brief, error: briefError } = await db
    .from("briefs")
    .select("id, opening, angle_type, evidence, competitor_recency, competitor_note")
    .eq("run_id", runId)
    .eq("status", "promoted")
    .order("rank", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (briefError) {
    return NextResponse.json({ error: `Failed to load briefs: ${briefError.message}` }, { status: 500 });
  }
  if (!brief) {
    return NextResponse.json({ runId, finalized: null, reason: "no promoted briefs with surviving hooks" });
  }

  const { data: hook, error: hookError } = await db
    .from("hooks")
    .select("id, hook_text, rationale")
    .eq("brief_id", brief.id)
    .eq("status", "survivor")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (hookError) {
    return NextResponse.json({ error: `Failed to load hooks for brief ${brief.id}: ${hookError.message}` }, { status: 500 });
  }
  if (!hook) {
    return NextResponse.json({ runId, finalized: null, reason: "no promoted briefs with surviving hooks" });
  }

  const input: Json = {
    hook_text: hook.hook_text,
    rationale: hook.rationale,
    opening: brief.opening,
    angle_type: brief.angle_type,
    evidence: brief.evidence,
    competitor_recency: brief.competitor_recency,
    competitor_note: brief.competitor_note,
  };

  const stepOrder = await nextStepOrder(db, runId);
  const output = await runAgent({
    runId,
    agentName: "ideaFinalizer",
    stepOrder,
    promptFile: "ideaFinalizer.md",
    input,
    schema: ideaFinalizerOutputSchema,
    inheritsSharedRules: false,
  });

  const { error: selectError } = await db.from("hooks").update({ status: "selected" }).eq("id", hook.id);
  if (selectError) {
    return NextResponse.json({ error: `Failed to mark hook ${hook.id} selected: ${selectError.message}` }, { status: 500 });
  }

  return NextResponse.json({ runId, briefId: brief.id, hookId: hook.id, ingestionObject: output });
}
