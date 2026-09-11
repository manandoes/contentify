/**
 * The one path from an approved, scheduled version to a real post
 * (Implementationplan.md Block E: "idempotency key checked before every
 * attempt"). Both callers — the /api/publish cron route and the founder's
 * "Publish now" button — come through here, so the safety gates cannot be
 * bypassed by choosing a different entry point.
 *
 * It never branches on platform: connectors/index.ts hands it a
 * PlatformConnector and a platform with no real connector resolves to
 * READY_TO_POST through the same code (Rules.md §1.3).
 *
 * The preconditions it checks before every attempt (duplicate outcome,
 * human-approval gate, attempt cap) live in services/approvalWorkflow.ts,
 * pure and unit-tested.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import { getConnector } from "@/connectors";
import { MAX_ATTEMPTS, guardPublish, statusAfterPublish } from "./approvalWorkflow";
import type { PublishableContent, PublishResult } from "@/connectors/base";
import type { CaptionAgentOutput } from "@/types/agents";
import type { Database } from "@/types/database";
import type { ContentStatus } from "@/types/enums";

/** Signed-URL lifetime for media handed to a connector. Long enough for one upload, short enough not to linger. */
const MEDIA_URL_TTL_SECONDS = 600;

export type PublishAttempt =
  | { outcome: "PUBLISHED"; scheduledPostId: string; platformPostId: string }
  | { outcome: "READY_TO_POST"; scheduledPostId: string; reason: string }
  | { outcome: "FAILED"; scheduledPostId: string; error: string }
  | { outcome: "RETRY_LATER"; scheduledPostId: string; error: string; attempts: number }
  | { outcome: "SKIPPED"; scheduledPostId: string; reason: string };

interface ScheduledPostRow {
  id: string;
  idempotency_key: string;
  attempts: number;
  content_versions: {
    id: string;
    platform: Database["public"]["Enums"]["platform"];
    status: ContentStatus;
    caption: unknown;
    content_id: string;
  };
}

const SCHEDULED_POST_SELECT =
  "id, idempotency_key, attempts, content_versions!inner(id, platform, status, caption, content_id)";

/**
 * The media a connector should publish: the crop matching this platform's
 * aspect ratio if Phase 8 produced one, otherwise nothing. Handed over as a
 * short-lived signed URL rather than a storage path — the bucket is private
 * (Phase 8 migration) and connectors have no business knowing about Supabase
 * Storage.
 */
const PLATFORM_ASPECT_RATIO: Partial<Record<Database["public"]["Enums"]["platform"], string>> = {
  linkedin: "1:1",
  instagram: "4:5",
};

async function mediaUrlsFor(
  db: SupabaseClient<Database>,
  contentId: string,
  platform: Database["public"]["Enums"]["platform"],
): Promise<string[]> {
  const aspectRatio = PLATFORM_ASPECT_RATIO[platform];
  if (!aspectRatio) return [];

  const { data, error } = await db
    .from("content_assets")
    .select("storage_path")
    .eq("content_id", contentId)
    .eq("aspect_ratio", aspectRatio)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load media for content ${contentId}: ${error.message}`);
  if (!data) return [];

  const { data: signed, error: signError } = await db.storage
    .from("content-assets")
    .createSignedUrl(data.storage_path, MEDIA_URL_TTL_SECONDS);

  if (signError || !signed) throw new Error(`Failed to sign media URL for ${data.storage_path}: ${signError?.message}`);
  return [signed.signedUrl];
}

/** The outcome already recorded for this scheduled post, or null if it has never been attempted to completion. */
async function recordedOutcome(db: SupabaseClient<Database>, scheduledPostId: string): Promise<ContentStatus | null> {
  const { data, error } = await db
    .from("published_posts")
    .select("status")
    .eq("scheduled_post_id", scheduledPostId)
    .maybeSingle();

  if (error) throw new Error(`Failed to check for an existing publish of ${scheduledPostId}: ${error.message}`);
  return data?.status ?? null;
}

async function recordSuccess(
  db: SupabaseClient<Database>,
  post: ScheduledPostRow,
  result: Extract<PublishResult, { status: "PUBLISHED" | "READY_TO_POST" }>,
): Promise<void> {
  const status = result.status;

  // Insert first: the unique index on published_posts(scheduled_post_id)
  // means a concurrent attempt that got here at the same moment loses here,
  // before either of them can claim success on the version.
  const { error: insertError } = await db.from("published_posts").insert({
    scheduled_post_id: post.id,
    content_version_id: post.content_versions.id,
    platform: post.content_versions.platform,
    platform_post_id: status === "PUBLISHED" ? result.platformPostId : null,
    published_at: status === "PUBLISHED" ? result.publishedAt : null,
    status,
  });
  if (insertError) throw new Error(`Failed to record the publish of ${post.id}: ${insertError.message}`);

  const versionStatus = statusAfterPublish(status);
  const { error: versionError } = await db
    .from("content_versions")
    .update({ status: versionStatus })
    .eq("id", post.content_versions.id);
  if (versionError) throw new Error(`Published, but failed to update content_versions ${post.content_versions.id}: ${versionError.message}`);

  const { error: postError } = await db
    .from("scheduled_posts")
    .update({ status: versionStatus, attempts: post.attempts + 1, last_error: null })
    .eq("id", post.id);
  if (postError) throw new Error(`Published, but failed to update scheduled_posts ${post.id}: ${postError.message}`);
}

/**
 * A failure records no published_posts row — nothing was published, and a
 * row there means an outcome exists. Rules.md §3 instead wants the error on
 * the scheduled post and the content left exportable, which is what
 * statusAfterPublish("FAILED") produces.
 */
async function recordFailure(db: SupabaseClient<Database>, post: ScheduledPostRow, error: string): Promise<void> {
  const { error: postError } = await db
    .from("scheduled_posts")
    .update({ status: "FAILED", attempts: post.attempts + 1, last_error: error })
    .eq("id", post.id);
  if (postError) throw new Error(`Failed to record the publish failure for ${post.id}: ${postError.message}`);

  const { error: versionError } = await db
    .from("content_versions")
    .update({ status: statusAfterPublish("FAILED") })
    .eq("id", post.content_versions.id);
  if (versionError) throw new Error(`Failed to mark content_versions ${post.content_versions.id} ready to post: ${versionError.message}`);
}

/** A retryable failure leaves the post SCHEDULED so the next pass picks it up — Rules.md §3's "queue for later". */
async function recordRetry(db: SupabaseClient<Database>, post: ScheduledPostRow, error: string): Promise<void> {
  const { error: postError } = await db
    .from("scheduled_posts")
    .update({ attempts: post.attempts + 1, last_error: error })
    .eq("id", post.id);
  if (postError) throw new Error(`Failed to record the retry for ${post.id}: ${postError.message}`);
}

export async function publishScheduledPost(
  scheduledPostId: string,
  db: SupabaseClient<Database> = supabaseServer(),
): Promise<PublishAttempt> {
  const { data, error } = await db
    .from("scheduled_posts")
    .select(SCHEDULED_POST_SELECT)
    .eq("id", scheduledPostId)
    .maybeSingle<ScheduledPostRow>();

  if (error) throw new Error(`Failed to load scheduled post ${scheduledPostId}: ${error.message}`);
  if (!data) return { outcome: "SKIPPED", scheduledPostId, reason: "That scheduled post no longer exists." };

  const guard = guardPublish({
    versionStatus: data.content_versions.status,
    recordedOutcome: await recordedOutcome(db, data.id),
    attempts: data.attempts,
  });
  if (!guard.proceed) return { outcome: "SKIPPED", scheduledPostId, reason: guard.reason };

  const caption = data.content_versions.caption as CaptionAgentOutput | null;
  if (!caption) {
    await recordFailure(db, data, "This version has no caption to publish.");
    return { outcome: "FAILED", scheduledPostId, error: "This version has no caption to publish." };
  }

  let mediaUrls: string[];
  try {
    mediaUrls = await mediaUrlsFor(db, data.content_versions.content_id, data.content_versions.platform);
  } catch (mediaError) {
    const message = (mediaError as Error).message;
    await recordFailure(db, data, message);
    return { outcome: "FAILED", scheduledPostId, error: message };
  }

  const payload: PublishableContent = {
    contentVersionId: data.content_versions.id,
    platform: data.content_versions.platform,
    caption: {
      hook: caption.hook,
      body: caption.body,
      cta: caption.cta,
      hashtags: caption.hashtags,
      firstComment: caption.first_comment,
    },
    mediaUrls,
    idempotencyKey: data.idempotency_key,
  };

  const result = await getConnector(data.content_versions.platform, db).publish(payload);

  if (result.status === "PUBLISHED") {
    await recordSuccess(db, data, result);
    return { outcome: "PUBLISHED", scheduledPostId, platformPostId: result.platformPostId };
  }

  if (result.status === "READY_TO_POST") {
    await recordSuccess(db, data, result);
    return {
      outcome: "READY_TO_POST",
      scheduledPostId,
      reason: `${data.content_versions.platform} has no publishing API — export and post this one by hand.`,
    };
  }

  const attempts = data.attempts + 1;
  if (result.retryable && attempts < MAX_ATTEMPTS) {
    const queued = result.retryAfterSeconds
      ? `${result.error} (LinkedIn asked to wait ${result.retryAfterSeconds}s; queued for the next pass)`
      : `${result.error} (queued for the next pass)`;
    await recordRetry(db, data, queued);
    return { outcome: "RETRY_LATER", scheduledPostId, error: queued, attempts };
  }

  await recordFailure(db, data, result.error);
  return { outcome: "FAILED", scheduledPostId, error: result.error };
}

/**
 * Every scheduled post whose time has come. Serial, not parallel: these hit
 * rate-limited platform APIs, and a handful of posts a day never needs the
 * concurrency.
 */
export async function publishDuePosts(
  db: SupabaseClient<Database> = supabaseServer(),
  now: Date = new Date(),
): Promise<PublishAttempt[]> {
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id")
    .eq("status", "SCHEDULED")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true });

  if (error) throw new Error(`Failed to load due scheduled posts: ${error.message}`);

  const attempts: PublishAttempt[] = [];
  for (const row of data ?? []) {
    attempts.push(await publishScheduledPost(row.id, db));
  }
  return attempts;
}
