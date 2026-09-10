/**
 * Shared plumbing for the three idea-engine stage routes
 * (app/api/ideas/research|hooks|finalize). Per Implementationplan.md's
 * locked decision #2, each agent gets its own cron-triggered endpoint
 * rather than one route calling all three in sequence — this keeps every
 * request well under Vercel's function budget and makes the one-job rule
 * structural (an agent physically cannot call another across an HTTP
 * boundary). This file is what lets the three routes agree on one run_id
 * and keep agent_runs.step_order monotonic across that shared run.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Single-tenant lookup (Implementationplan.md "App scope" decision — one seeded brand). */
export async function getBrandId(db: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await db.from("brands").select("id").limit(1).single();
  if (error || !data) {
    throw new Error(`No brand row found — run supabase/seed.sql first: ${error?.message}`);
  }
  return data.id;
}

/** Research is the only stage allowed to start a new run; hooks/finalize must be given one. */
export function resolveRunId(provided?: string): string {
  return provided ?? crypto.randomUUID();
}

/**
 * Next agent_runs.step_order for this run_id. Queried fresh before every
 * runAgent() call rather than tracked in memory so ordering stays correct
 * both within a stage that makes several calls (hooks: one per brief) and
 * across stages invoked as separate requests by the daily-ideas workflow.
 */
export async function nextStepOrder(db: SupabaseClient<Database>, runId: string): Promise<number> {
  const { data, error } = await db
    .from("agent_runs")
    .select("step_order")
    .eq("run_id", runId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read agent_runs for run ${runId}: ${error.message}`);
  return (data?.step_order ?? 0) + 1;
}
