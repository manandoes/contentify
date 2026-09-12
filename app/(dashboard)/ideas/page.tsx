import "server-only";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/db";
import type { Database } from "@/types/database";

// Reads live idea-engine output on every request — never prerendered/cached,
// since new runs land continuously via .github/workflows/daily-ideas.yml.
export const dynamic = "force-dynamic";

type Evidence = { source: string; url: string; excerpt: string };
type Score = { novelty: number; relevance: number; proof_of_demand: number; effort: number };
type Hook = Database["public"]["Tables"]["hooks"]["Row"];
type Brief = Database["public"]["Tables"]["briefs"]["Row"] & { hooks: Hook[] };

const RECENCY_BADGE: Record<
  Database["public"]["Enums"]["competitor_recency"],
  { label: string; variant: "secondary" | "default" | "destructive" }
> = {
  clear: { label: "Clear", variant: "secondary" },
  trending: { label: "Trending", variant: "default" },
  recently_covered: { label: "Recently covered", variant: "destructive" },
};

async function getLatestRunBriefs(): Promise<Brief[]> {
  const db = supabaseServer();

  const { data: latest } = await db.from("briefs").select("run_id").order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!latest) return [];

  const { data: briefs, error } = await db
    .from("briefs")
    .select("*, hooks(*)")
    .eq("run_id", latest.run_id)
    .order("rank", { ascending: true });

  if (error || !briefs) return [];
  return briefs as Brief[];
}

export default async function IdeasPage() {
  const briefs = await getLatestRunBriefs();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>

      {briefs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No runs yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Trigger the idea engine (research → hooks → finalize) to see today&apos;s ranked,
            sourced openings here.
          </CardContent>
        </Card>
      ) : (
        briefs.map((brief) => {
          const recency = RECENCY_BADGE[brief.competitor_recency];
          const evidence = (brief.evidence as Evidence[] | null) ?? [];
          const score = brief.score as Score | null;

          return (
            <Card key={brief.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>
                    #{brief.rank ?? "-"} · {brief.angle_type}
                  </CardTitle>
                  <Badge variant={recency.variant}>{recency.label}</Badge>
                  {brief.status === "dropped" && <Badge variant="destructive">Dropped</Badge>}
                </div>
                <CardDescription>{brief.opening}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {brief.competitor_note && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Competitor note: </span>
                    {brief.competitor_note}
                  </p>
                )}

                {brief.performance_note && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Past performance: </span>
                    {brief.performance_note}
                  </p>
                )}

                {score && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <span>Novelty {score.novelty}</span>
                    <span>Relevance {score.relevance}</span>
                    <span>Proof of demand {score.proof_of_demand}</span>
                    <span>Effort {score.effort}</span>
                  </div>
                )}

                {evidence.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Evidence</p>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {evidence.map((item, i) => (
                        <li key={i}>
                          <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                            {item.source}
                          </a>
                          {" — "}
                          {item.excerpt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.hooks.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Hooks</p>
                    <ul className="space-y-2">
                      {brief.hooks.map((hook) => (
                        <li key={hook.id} className="rounded-md border p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium">{hook.hook_text}</p>
                            {hook.status === "selected" && <Badge>Selected</Badge>}
                          </div>
                          <p className="text-muted-foreground">{hook.rationale}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
