"use server";

/**
 * Phase 13's "Refresh now" — the founder-facing counterpart to the
 * /api/analytics cron pass, same call underneath (services/analytics.ts),
 * same reasoning as content/actions.ts's publishNow: the button can't fetch
 * anything the cron couldn't, or skip a check by arriving from the UI.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/db";
import { fetchAllPendingAnalytics } from "@/services/analytics";

export type RefreshResult = { ok: true; fetched: number; attempted: number } | { ok: false; error: string };

export async function refreshAnalyticsNow(): Promise<RefreshResult> {
  const db = supabaseServer();

  let results;
  try {
    results = await fetchAllPendingAnalytics(db);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to fetch analytics" };
  }

  revalidatePath("/analytics");
  return { ok: true, fetched: results.filter((r) => r.outcome === "FETCHED").length, attempted: results.length };
}
