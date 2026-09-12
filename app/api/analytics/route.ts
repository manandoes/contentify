/**
 * Phase 13 — Architecture.md §4 `/api/analytics`. Polled by
 * .github/workflows/analytics.yml. Same CRON_SECRET bearer auth and
 * always-200 shape as app/api/publish/route.ts: per-post outcomes are the
 * answer, not a reason to fail the whole run.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { fetchAllPendingAnalytics, fetchAnalyticsForPost, type AnalyticsFetchResult } from "@/services/analytics";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { publishedPostId?: unknown };
  const db = supabaseServer();

  let results: AnalyticsFetchResult[];
  try {
    results =
      typeof body.publishedPostId === "string" && body.publishedPostId
        ? [await fetchAnalyticsForPost(body.publishedPostId, db)]
        : await fetchAllPendingAnalytics(db);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    attempted: results.length,
    fetched: results.filter((result) => result.outcome === "FETCHED").length,
    results,
  });
}
