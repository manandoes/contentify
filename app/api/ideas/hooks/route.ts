/**
 * Phase 3, stage 2 — chained after /api/ideas/research by
 * .github/workflows/daily-ideas.yml. Runs the Hook-writer once per
 * promoted brief from the given run (sequentially, so agent_runs.step_order
 * stays meaningful). A brief whose hook-writer call returns zero survivors
 * (Rules.md §4: an unresolved recently_covered conflict) is dropped here.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runAgent } from "@/lib/gemini";
import { nextStepOrder } from "@/services/orchestrator";
import { hookWriterOutputSchema } from "@/types/agents";
import type { Json } from "@/types/database";

interface RequestBody {
  runId: string;
}

interface StageResult {
  briefId: string;
  survivorCount: number;
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

  const { data: briefs, error: briefsError } = await db
    .from("briefs")
    .select("id, opening, angle_type, evidence, competitor_recency, competitor_note")
    .eq("run_id", runId)
    .eq("status", "promoted")
    .order("rank", { ascending: true });

  if (briefsError) {
    return NextResponse.json({ error: `Failed to load briefs: ${briefsError.message}` }, { status: 500 });
  }

  const results: StageResult[] = [];

  for (const brief of briefs ?? []) {
    const input: Json = {
      brief_id: brief.id,
      opening: brief.opening,
      angle_type: brief.angle_type,
      evidence: brief.evidence,
      competitor_recency: brief.competitor_recency,
      competitor_note: brief.competitor_note,
    };

    const stepOrder = await nextStepOrder(db, runId);
    const output = await runAgent({
      runId,
      agentName: "hookWriter",
      stepOrder,
      promptFile: "hookWriter.md",
      input,
      schema: hookWriterOutputSchema,
      inheritsSharedRules: false,
    });

    if (output.survivors.length > 0) {
      const { error: hooksError } = await db.from("hooks").insert(
        output.survivors.map((survivor) => ({
          brief_id: brief.id,
          hook_text: survivor.hook_text,
          rationale: survivor.rationale,
          status: "survivor",
        })),
      );
      if (hooksError) {
        return NextResponse.json({ error: `Failed to insert hooks for brief ${brief.id}: ${hooksError.message}` }, { status: 500 });
      }
    } else {
      const { error: dropError } = await db.from("briefs").update({ status: "dropped" }).eq("id", brief.id);
      if (dropError) {
        return NextResponse.json({ error: `Failed to drop brief ${brief.id}: ${dropError.message}` }, { status: 500 });
      }
    }

    results.push({ briefId: brief.id, survivorCount: output.survivors.length });
  }

  return NextResponse.json({ runId, results });
}
