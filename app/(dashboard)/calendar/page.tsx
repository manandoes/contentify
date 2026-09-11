import "server-only";
import { supabaseServer } from "@/lib/db";
import { getBrandId } from "@/services/orchestrator";
import type { Database } from "@/types/database";
import { CalendarView, type ScheduledItem } from "./calendar-view";

// Same reasoning as app/(dashboard)/content/page.tsx: a schedule made from
// /content must show up here immediately, never from a stale cache.
export const dynamic = "force-dynamic";

type ScheduledPostRow = Pick<Database["public"]["Tables"]["scheduled_posts"]["Row"], "id" | "scheduled_for" | "status">;
type ContentVersionRow = Pick<Database["public"]["Tables"]["content_versions"]["Row"], "platform"> & {
  content: Pick<Database["public"]["Tables"]["content"]["Row"], "title" | "brand_id">;
  scheduled_posts: ScheduledPostRow[];
};

// scheduled_posts is the source of truth for "when" — a version's own status
// can move on past SCHEDULED in later phases (PUBLISHED, FAILED) without
// losing its place on the calendar, so this reads from scheduled_posts
// upward rather than filtering content_versions.status === "SCHEDULED".
async function getScheduledItems(): Promise<ScheduledItem[]> {
  const db = supabaseServer();
  const brandId = await getBrandId(db);

  const { data, error } = await db
    .from("content_versions")
    .select("platform, content:content_id!inner(title, brand_id), scheduled_posts!inner(id, scheduled_for, status)")
    .eq("content.brand_id", brandId)
    .returns<ContentVersionRow[]>();

  if (error) throw new Error(`Failed to load scheduled content: ${error.message}`);

  return (data ?? [])
    .flatMap((version) =>
      version.scheduled_posts.map((post) => ({
        scheduledPostId: post.id,
        scheduledFor: post.scheduled_for,
        status: post.status,
        platform: version.platform,
        title: version.content.title,
      })),
    )
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export default async function CalendarPage() {
  const items = await getScheduledItems();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <CalendarView items={items} />
    </div>
  );
}
