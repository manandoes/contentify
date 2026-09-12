/**
 * Phase 14 — polled by .github/workflows/performance.yml. Same CRON_SECRET
 * bearer auth as the other cron routes (app/api/analytics,
 * app/api/ideas/*). Runs the Performance Agent once against everything
 * currently in published_posts/analytics and writes one performance_reports
 * row (services/performanceReport.ts owns the actual query + agent call).
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runPerformanceAgent } from "@/services/performanceReport";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPerformanceAgent(supabaseServer());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
