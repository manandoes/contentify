import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 10 builds this for real: today/week/month over scheduled_posts. */
export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <Card>
        <CardHeader>
          <CardTitle>Today / week / month — Phase 10</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Approved and scheduled content will show up here by date once
          scheduled_posts has real rows.
        </CardContent>
      </Card>
    </div>
  );
}
