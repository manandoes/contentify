import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Phase 0 stub. Real home screen (today's ideas, pending approvals, what's
 *  scheduled) is assembled once Ideas/Content/Calendar have real data. */
export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming online as each phase lands</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This will summarize today&apos;s idea-engine output, pending approvals, and
          what&apos;s scheduled next, once those screens exist.
        </CardContent>
      </Card>
    </div>
  );
}
