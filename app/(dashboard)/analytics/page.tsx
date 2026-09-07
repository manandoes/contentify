import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 13 builds this for real: per-platform metrics, null for anything
 *  a platform doesn't expose — never guessed. */
export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <Card>
        <CardHeader>
          <CardTitle>Real metrics against real published posts — Phase 13</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Whatever each connected platform exposes will show up here.
          Anything a platform doesn&apos;t expose is shown as missing, never estimated.
        </CardContent>
      </Card>
    </div>
  );
}
