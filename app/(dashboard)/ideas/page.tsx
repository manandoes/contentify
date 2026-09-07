import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 3 builds this for real: today's 3 ranked, sourced openings with
 *  hooks and the competitor_recency flag next to each (Phases.md Phase 3). */
export default function IdeasPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Idea Engine output lands here — Phase 3</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Once the Researcher, Hook-writer, and Idea-finalizer agents are wired up, this
          screen shows today&apos;s 3 ranked, sourced openings with their hooks and
          competitor-recency flag.
        </CardContent>
      </Card>
    </div>
  );
}
