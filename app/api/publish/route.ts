/**
 * Phase 11 — the scheduler's other half (Architecture.md §4 `/api/publish`).
 * Phase 10 gave scheduled posts a date; this is what makes that date mean
 * something. Polled by .github/workflows/publish.yml, and the poll interval
 * doubles as the retry backoff for queued failures (services/publisher.ts).
 *
 * Same CRON_SECRET bearer auth as every other automation route. All the
 * safety gates — human approval, duplicate protection, attempt caps — live
 * in services/publisher.ts, not here, so a second caller can never get a
 * weaker version of them.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { publishDuePosts, publishScheduledPost, type PublishAttempt } from "@/services/publisher";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { scheduledPostId?: unknown };
  const db = supabaseServer();

  let attempts: PublishAttempt[];
  try {
    attempts =
      typeof body.scheduledPostId === "string" && body.scheduledPostId
        ? [await publishScheduledPost(body.scheduledPostId, db)]
        : await publishDuePosts(db);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  // 200 even when individual posts failed: the run itself succeeded, and the
  // per-post outcomes are the answer. A non-2xx here would fail the whole
  // GitHub Actions job over one bad caption.
  return NextResponse.json({
    attempted: attempts.length,
    published: attempts.filter((attempt) => attempt.outcome === "PUBLISHED").length,
    attempts,
  });
}
