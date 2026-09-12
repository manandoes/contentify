import "server-only";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabaseServer } from "@/lib/db";
import { getBrandId } from "@/services/orchestrator";
import { latestAnalyticsByPost, type AnalyticsRow } from "@/services/analyticsView";
import type { Database } from "@/types/database";
import { RefreshButton } from "./refresh-button";

// A fresh publish or a manual "Refresh now" must show up immediately, same
// reasoning as app/(dashboard)/content/page.tsx and .../calendar/page.tsx.
export const dynamic = "force-dynamic";

type PublishedPostRow = Pick<Database["public"]["Tables"]["published_posts"]["Row"], "id" | "platform" | "published_at"> & {
  content_versions: { content: { title: string } };
};

interface PublishedPostView {
  id: string;
  platform: string;
  publishedAt: string | null;
  title: string;
}

async function getPublishedPosts(): Promise<{ posts: PublishedPostView[]; analytics: Map<string, AnalyticsRow> }> {
  const db = supabaseServer();
  const brandId = await getBrandId(db);

  const { data: postRows, error: postsError } = await db
    .from("published_posts")
    .select("id, platform, published_at, content_versions!inner(content:content_id!inner(title, brand_id))")
    .eq("status", "PUBLISHED")
    .eq("content_versions.content.brand_id", brandId)
    .order("published_at", { ascending: false })
    .returns<PublishedPostRow[]>();

  if (postsError) throw new Error(`Failed to load published posts: ${postsError.message}`);

  const posts: PublishedPostView[] = (postRows ?? []).map((row) => ({
    id: row.id,
    platform: row.platform,
    publishedAt: row.published_at,
    title: row.content_versions.content.title,
  }));

  if (posts.length === 0) return { posts, analytics: new Map() };

  const { data: analyticsRows, error: analyticsError } = await db
    .from("analytics")
    .select("*")
    .in(
      "published_post_id",
      posts.map((post) => post.id),
    );

  if (analyticsError) throw new Error(`Failed to load analytics: ${analyticsError.message}`);

  return { posts, analytics: latestAnalyticsByPost(analyticsRows ?? []) };
}

/** Never a bare 0 vs. "not tracked" vs. "not fetched yet" — Rules.md §4: store null, never guess. */
function MetricCell({ hasRow, value }: { hasRow: boolean; value: number | null }) {
  if (!hasRow) return <TableCell className="text-muted-foreground italic">not fetched yet</TableCell>;
  if (value === null) return <TableCell className="text-muted-foreground italic">not exposed</TableCell>;
  return <TableCell>{value.toLocaleString()}</TableCell>;
}

export default async function AnalyticsPage() {
  const { posts, analytics } = await getPublishedPosts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        {posts.length > 0 && <RefreshButton />}
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No published posts yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Once something publishes through a real platform connection (Phase 11/12), its metrics —
            whatever that platform exposes — land here. Anything a platform doesn&apos;t expose is
            shown as not exposed, never estimated.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Impressions</TableHead>
                  <TableHead>Likes</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Saves</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Last fetched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const row = analytics.get(post.id);
                  const hasRow = row !== undefined;
                  return (
                    <TableRow key={post.id}>
                      <TableCell className="capitalize">{post.platform}</TableCell>
                      <TableCell>{post.title}</TableCell>
                      <TableCell>{post.publishedAt ? new Date(post.publishedAt).toLocaleString() : "—"}</TableCell>
                      <MetricCell hasRow={hasRow} value={row?.impressions ?? null} />
                      <MetricCell hasRow={hasRow} value={row?.likes ?? null} />
                      <MetricCell hasRow={hasRow} value={row?.comments ?? null} />
                      <MetricCell hasRow={hasRow} value={row?.shares ?? null} />
                      <MetricCell hasRow={hasRow} value={row?.saves ?? null} />
                      <MetricCell hasRow={hasRow} value={row?.clicks ?? null} />
                      <TableCell className="text-muted-foreground">{hasRow ? new Date(row!.fetched_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
