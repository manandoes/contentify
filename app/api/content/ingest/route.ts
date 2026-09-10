/**
 * Phase 5, stage 1 (Architecture.md §4 /api/content/ingest). Accepts either
 * the idea-finalizer's ingestion object (chained from /api/ideas/finalize's
 * `ingestionObject`) or a manually pasted post, and creates the `content`
 * row every downstream content-machine stage reads from. Does not run the
 * Content Analyzer itself — see /api/content/generate (Architecture.md's
 * one-job rule keeps ingestion and analysis as separate boxes).
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { getBrandId } from "@/services/orchestrator";
import { contentIngestSchema } from "@/types/content";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = contentIngestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid content object", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const db = supabaseServer();
  const brandId = await getBrandId(db);

  if (input.source_brief_id) {
    const { data: brief, error: briefError } = await db
      .from("briefs")
      .select("id")
      .eq("id", input.source_brief_id)
      .maybeSingle();
    if (briefError) {
      return NextResponse.json({ error: `Failed to look up source brief: ${briefError.message}` }, { status: 500 });
    }
    if (!brief) {
      return NextResponse.json({ error: `source_brief_id ${input.source_brief_id} not found` }, { status: 400 });
    }
  }

  const { data: content, error: insertError } = await db
    .from("content")
    .insert({
      brand_id: brandId,
      source_brief_id: input.source_brief_id ?? null,
      title: input.title,
      original_content: input.content,
      content_type: input.content_type,
      original_platform: input.original_platform,
      goal: input.goal,
      audience: input.audience,
      cta: input.cta,
      status: "DRAFT",
    })
    .select("id, title, status, created_at")
    .single();

  if (insertError || !content) {
    return NextResponse.json({ error: `Failed to insert content: ${insertError?.message}` }, { status: 500 });
  }

  return NextResponse.json({ brandId, content });
}
