/**
 * Phase 14 — polled by .github/workflows/content-memory.yml. Re-syncs
 * content_memory from every real (platform-API) published post, same
 * always-recompute shape as app/api/analytics/route.ts: cheap to re-run,
 * upserts on content_id, safe on overlap with a concurrent run.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { syncContentMemory } from "@/services/contentMemory";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncContentMemory(supabaseServer());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
