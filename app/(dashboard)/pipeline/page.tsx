import "server-only";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/db";
import { formatDuration, groupRunsByDay, groupRunsByRunId, runStatus, type AgentRunRow, type PipelineRun, type RunStatus } from "@/services/pipelineView";

// Every idea-engine and content-machine agent call lands in agent_runs the
// moment it happens (lib/gemini.ts's runAgent) — this must never be
// prerendered/cached, or a run in progress right now would look finished.
export const dynamic = "force-dynamic";

// Bounds one page load rather than rendering every row this system has ever
// logged; recent history is what "see what every agent did" is for, not a
// full audit archive.
const MAX_ROWS = 500;

const RUN_STATUS_BADGE: Record<RunStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  running: { label: "Running", variant: "secondary" },
  failed: { label: "Failed validation", variant: "destructive" },
  succeeded: { label: "Succeeded", variant: "default" },
};

const STEP_STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  running: { label: "Running", variant: "secondary" },
  succeeded: { label: "Succeeded", variant: "default" },
  failed_validation: { label: "Failed validation", variant: "destructive" },
};

async function getRunsByDay() {
  const db = supabaseServer();

  const { data, error } = await db.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(MAX_ROWS);

  if (error) throw new Error(`Failed to load agent_runs: ${error.message}`);

  return groupRunsByDay(groupRunsByRunId((data ?? []) as AgentRunRow[]));
}

function JsonBlock({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  if (value === null || value === undefined) {
    return <p className="text-xs italic text-muted-foreground">{emptyLabel}</p>;
  }
  return <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-break-word">{JSON.stringify(value, null, 2)}</pre>;
}

function StepRow({ step }: { step: AgentRunRow }) {
  const badge = STEP_STATUS_BADGE[step.status] ?? { label: step.status, variant: "secondary" as const };
  return (
    <details className="rounded-md border p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          #{step.step_order} · {step.agent_name}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span>{formatDuration(step.duration_ms)}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Input</p>
          <JsonBlock value={step.input} emptyLabel="no input" />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</p>
          <JsonBlock value={step.output} emptyLabel="no output yet" />
        </div>
      </div>
    </details>
  );
}

function RunCard({ run }: { run: PipelineRun }) {
  const status = runStatus(run.steps);
  const badge = RUN_STATUS_BADGE[status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-mono text-sm font-normal text-muted-foreground">{run.runId}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{new Date(run.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {run.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </CardContent>
    </Card>
  );
}

export default async function PipelinePage() {
  const days = await getRunsByDay();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>

      {days.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No runs yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Every agent call — idea engine or content machine — logs to agent_runs the moment it
            happens. Trigger any stage (research, hooks, finalize, content generation) to see its
            steps land here, in order.
          </CardContent>
        </Card>
      ) : (
        days.map((day) => (
          <div key={day.dayKey} className="space-y-3">
            <h2 className="text-lg font-medium text-muted-foreground">{day.dayLabel}</h2>
            <div className="space-y-3">
              {day.runs.map((run) => (
                <RunCard key={run.runId} run={run} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
