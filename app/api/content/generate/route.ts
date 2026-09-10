/**
 * Phase 5+6+7 (Architecture.md §4 /api/content/generate: "runs analyzer +
 * platform adapters" — one route, per that folder plan; Implementationplan.md's
 * repository layout has no separate caption route, so Phase 7 lands here
 * too). Thin auth + HTTP wrapper around services/contentGenerator.ts, which
 * holds the actual Content Analyzer -> Platform Adapter -> Caption Agent
 * pipeline — Phase 9's Regenerate action calls that same service directly
 * (server action, no HTTP hop), so this route and the approval screen can
 * never drift apart. content_versions.status is left wherever the DB has
 * it (DRAFT by default); Phase 9 owns the approval-status transitions.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { GenerateError, runContentGenerate } from "@/services/contentGenerator";

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

  try {
    const result = await runContentGenerate(db, body.contentId, body.runId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GenerateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
