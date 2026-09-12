/**
 * Pure Phase 15 helpers for shaping agent_runs into the /pipeline view: one
 * row per agent call, grouped into runs (by run_id, ordered by step_order)
 * and then into days (by each run's first step) — kept dependency-free so
 * the shaping decisions are unit-testable without a database, same split
 * as services/analyticsView.ts and services/performanceReportView.ts.
 *
 * Every agent call across both halves of the system shares one run_id and
 * a monotonic step_order (services/orchestrator.ts), so this is the one
 * place that reconstructs "what happened, in order" for any run — idea
 * engine or content machine — without re-deriving that logic per page.
 */
import type { Database } from "@/types/database";

export type AgentRunRow = Database["public"]["Tables"]["agent_runs"]["Row"];

export interface PipelineRun {
  runId: string;
  startedAt: string;
  steps: AgentRunRow[];
}

/** Groups already-flat agent_runs rows into one entry per run_id, steps ordered by step_order, runs ordered newest-first by their first step's started_at. */
export function groupRunsByRunId(rows: AgentRunRow[]): PipelineRun[] {
  const byRun = new Map<string, AgentRunRow[]>();
  for (const row of rows) {
    const steps = byRun.get(row.run_id);
    if (steps) steps.push(row);
    else byRun.set(row.run_id, [row]);
  }

  return [...byRun.entries()]
    .map(([runId, steps]) => {
      const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
      return { runId, startedAt: ordered[0].started_at, steps: ordered };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export type RunStatus = "running" | "failed" | "succeeded";

/** A still-running step always wins over a failure, so an in-flight run never reads as done; succeeded only when every step succeeded. */
export function runStatus(steps: AgentRunRow[]): RunStatus {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "failed_validation")) return "failed";
  return "succeeded";
}

export interface PipelineDay {
  dayKey: string;
  dayLabel: string;
  runs: PipelineRun[];
}

function dayKeyFor(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabelFor(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Runs arrive already newest-first (groupRunsByRunId); this only buckets by calendar day without re-sorting, so that order survives into each day's list. */
export function groupRunsByDay(runs: PipelineRun[]): PipelineDay[] {
  const days: PipelineDay[] = [];
  const indexByKey = new Map<string, number>();

  for (const run of runs) {
    const key = dayKeyFor(run.startedAt);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) days[existingIndex].runs.push(run);
    else {
      indexByKey.set(key, days.length);
      days.push({ dayKey: key, dayLabel: dayLabelFor(run.startedAt), runs: [run] });
    }
  }

  return days;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
