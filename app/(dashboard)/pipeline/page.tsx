import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 15 builds this for real: every agent run, step by step, reading
 *  from agent_runs. Cheap to build because lib/gemini.ts's runAgent()
 *  logs every call from the moment Block A lands. */
export default function PipelinePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
      <Card>
        <CardHeader>
          <CardTitle>Every agent&apos;s input/output, in order — Phase 15</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Open any day&apos;s run and see each agent&apos;s input/output in
          agent_runs.step_order once real runs exist to show.
        </CardContent>
      </Card>
    </div>
  );
}
