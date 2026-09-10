/**
 * Phase 5, stage 2 (Architecture.md §4 /api/content/generate). Runs the
 * Content Analyzer over one ingested `content` row and stores its output
 * in content.analysis. Architecture.md's folder plan has this same route
 * also run the platform adapters once Phase 6 builds them — today it only
 * runs analysis, matching Phase 5's scope in Phases.md.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runAgent } from "@/lib/gemini";
import { nextStepOrder, resolveRunId } from "@/services/orchestrator";
import { contentAnalyzerOutputSchema } from "@/types/agents";
import type { Json } from "@/types/database";

interface RequestBody {
  contentId: string;
  runId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: content, error: contentError } = await db
    .from("content")
    .select("id, title, original_content, content_type, goal, audience, cta")
    .eq("id", body.contentId)
    .maybeSingle();

  if (contentError) {
    return NextResponse.json({ error: `Failed to load content ${body.contentId}: ${contentError.message}` }, { status: 500 });
  }
  if (!content) {
    return NextResponse.json({ error: `content ${body.contentId} not found` }, { status: 404 });
  }

  const runId = resolveRunId(body.runId);

  // Rules.md §4 Content Analyzer INPUT: "the original content object
  // (title, content, media, goal, audience, CTA)". Media isn't in this
  // shape yet — content_assets rows are a Phase 8 concern.
  const input: Json = {
    title: content.title,
    content: content.original_content,
    content_type: content.content_type,
    media: [],
    goal: content.goal,
    audience: content.audience,
    cta: content.cta,
  };

  const stepOrder = await nextStepOrder(db, runId);
  const output = await runAgent({
    runId,
    agentName: "contentAnalyzer",
    stepOrder,
    promptFile: "contentAnalyzer.md",
    input,
    schema: contentAnalyzerOutputSchema,
  });

  const { error: updateError } = await db
    .from("content")
    .update({ analysis: output as Json })
    .eq("id", content.id);

  if (updateError) {
    return NextResponse.json({ error: `Failed to save analysis for content ${content.id}: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ runId, contentId: content.id, analysis: output });
}
