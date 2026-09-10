/**
 * Phase 2 — polled by .github/workflows/collect.yml every 20 minutes.
 * Fans out to every source adapter, dedupes on raw_signals.url (unique
 * constraint — insert with onConflict: "url", ignoreDuplicates), and never
 * lets one failing source take the others down with it.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import type { RawSignal } from "@/types/collector";
import { fetchSignals as fetchHackerNewsSignals } from "@/services/collector/hackernews";
import { fetchSignals as fetchRedditSignals } from "@/services/collector/reddit";
import { fetchSignals as fetchRssSignals, fetchCompetitorSignals } from "@/services/collector/rss";

interface SourceResult {
  source: string;
  fetched: number;
  error?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseServer();
  const signals: RawSignal[] = [];
  const results: SourceResult[] = [];

  async function run(source: string, fetcher: () => Promise<RawSignal[]>) {
    try {
      const fetched = await fetcher();
      signals.push(...fetched);
      results.push({ source, fetched: fetched.length });
    } catch (err) {
      results.push({ source, fetched: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { data: competitors, error: competitorsError } = await db
    .from("tracked_competitors")
    .select("id, name, feed_url")
    .not("feed_url", "is", null)
    .eq("manual_only", false);

  if (competitorsError) {
    return NextResponse.json({ error: `Failed to load tracked_competitors: ${competitorsError.message}` }, { status: 500 });
  }

  await Promise.all([
    run("hackernews", fetchHackerNewsSignals),
    run("reddit", fetchRedditSignals),
    run("rss:general", fetchRssSignals),
    ...(competitors ?? []).map((competitor) =>
      run(`competitor:${competitor.name}`, () =>
        fetchCompetitorSignals({ id: competitor.id, name: competitor.name, feedUrl: competitor.feed_url! }),
      ),
    ),
  ]);

  if (signals.length === 0) {
    return NextResponse.json({ inserted: 0, sources: results });
  }

  const rows = signals.map((signal) => ({
    source: signal.source,
    source_kind: signal.sourceKind,
    competitor_id: signal.competitorId ?? null,
    keyword_matched: signal.keywordMatched ?? null,
    title: signal.title,
    url: signal.url,
    raw_content: signal.rawContent ?? null,
    engagement_score: signal.engagementScore ?? null,
  }));

  const { data: inserted, error: insertError } = await db
    .from("raw_signals")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
    .select("id");

  if (insertError) {
    return NextResponse.json({ error: `Failed to insert raw_signals: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    fetched: signals.length,
    inserted: inserted?.length ?? 0,
    sources: results,
  });
}
