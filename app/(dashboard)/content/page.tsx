import "server-only";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/db";
import { getBrandId } from "@/services/orchestrator";
import type { Database } from "@/types/database";
import { VersionCard } from "./version-card";
import { RegenerateButton } from "./regenerate-button";

// Approval decisions land here from every /content visit — never
// prerendered/cached, same reasoning as app/(dashboard)/ideas/page.tsx.
export const dynamic = "force-dynamic";

type ContentVersion = Database["public"]["Tables"]["content_versions"]["Row"];
type Content = Database["public"]["Tables"]["content"]["Row"] & { content_versions: ContentVersion[] };

const STATUS_BADGE: Record<Database["public"]["Enums"]["content_status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  READY_FOR_REVIEW: { label: "Ready for review", variant: "secondary" },
  APPROVED: { label: "Approved", variant: "default" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  PUBLISHED: { label: "Published", variant: "default" },
  FAILED: { label: "Rejected", variant: "destructive" },
  READY_TO_POST: { label: "Ready to post", variant: "secondary" },
};

async function getReviewQueue(): Promise<Content[]> {
  const db = supabaseServer();
  const brandId = await getBrandId(db);

  // Generated versions land as DRAFT (services/contentGenerator.ts leaves
  // approval-status transitions to this screen); one with a caption is
  // finished and ready for a human decision.
  const { error: promoteError } = await db
    .from("content_versions")
    .update({ status: "READY_FOR_REVIEW" })
    .eq("status", "DRAFT")
    .not("caption", "is", null);
  if (promoteError) throw new Error(`Failed to promote generated content_versions: ${promoteError.message}`);

  const { data, error } = await db
    .from("content")
    .select("*, content_versions(*)")
    .eq("brand_id", brandId)
    .not("content_versions", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load content for review: ${error.message}`);
  return ((data ?? []) as Content[]).filter((item) => item.content_versions.length > 0);
}

export default async function ContentPage() {
  const items = await getReviewQueue();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to review yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Run /api/content/ingest then /api/content/generate for an idea to see its platform
            drafts land here for Edit / Approve / Reject / Regenerate.
          </CardContent>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.original_content}</CardDescription>
                </div>
                <RegenerateButton contentId={item.id} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[...item.content_versions]
                .sort((a, b) => a.platform.localeCompare(b.platform))
                .map((version) => (
                  <VersionCard key={version.id} version={version} badge={STATUS_BADGE[version.status]} />
                ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
