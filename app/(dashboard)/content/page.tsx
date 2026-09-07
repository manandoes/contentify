import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phases 5-9 build this for real: the content library and the human
 *  approval screen (Edit / Approve / Reject / Regenerate). */
export default function ContentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <Card>
        <CardHeader>
          <CardTitle>The review + approval library — Phases 5-9</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Every platform version of every idea will live here, driving
          Edit / Approve / Reject / Regenerate. Nothing publishes without a decision made
          on this screen.
        </CardContent>
      </Card>
    </div>
  );
}
