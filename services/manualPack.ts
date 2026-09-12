/**
 * The manual export pack (PRD.md: "Manual 'ready to post' export for
 * platforms without publishing APIs"; Phases.md Phase 12: "every intended
 * platform either publishes or produces a clean manual pack").
 *
 * Before this, a version on a platform with no connector reached
 * READY_TO_POST and stopped there — an honest status (Rules.md §1.3) with
 * no way to act on it. This is the other end of that path: everything the
 * founder needs to post it by hand, in one file, with nothing to retype.
 *
 * Deliberately available for *any* version with a caption, not only
 * READY_TO_POST ones. A connected platform can still be down, or unapproved,
 * or simply not worth waiting for, and "post this one by hand" must never
 * depend on the automated path having failed first.
 *
 * This half reads the database; the pack's shape and rendering are pure and
 * live in services/manualPackText.ts.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import { assembleCaption } from "@/connectors/captionText";
import type { CaptionAgentOutput } from "@/types/agents";
import type { Database } from "@/types/database";
import type { AspectRatio, Platform } from "@/types/enums";
import { PLATFORM_ASPECT_RATIO } from "@/types/platformRules";
import type { ManualPack, ManualPackAsset } from "./manualPackText";

export { renderManualPack } from "./manualPackText";
export type { ManualPack, ManualPackAsset } from "./manualPackText";

/**
 * Long enough for the founder to open the pack and save the images, short
 * enough not to linger — the storage bucket is private (Phase 8 migration)
 * and a signed URL is the only way out of it.
 */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

interface VersionRow {
  id: string;
  platform: Platform;
  status: string;
  caption: unknown;
  content_id: string;
}

async function signedAssets(
  db: SupabaseClient<Database>,
  contentId: string,
  platform: Platform,
): Promise<ManualPackAsset[]> {
  const { data, error } = await db
    .from("content_assets")
    .select("storage_path, aspect_ratio")
    .eq("content_id", contentId)
    .eq("is_original", false)
    .order("aspect_ratio");

  if (error) throw new Error(`Failed to load media for content ${contentId}: ${error.message}`);

  const crops = (data ?? []).filter(
    (row): row is { storage_path: string; aspect_ratio: AspectRatio } => row.aspect_ratio !== null,
  );
  if (crops.length === 0) return [];

  // Every crop, not just this platform's: someone posting by hand may be
  // cross-posting, so the right one is marked rather than the rest withheld.
  const recommended = PLATFORM_ASPECT_RATIO[platform];

  const { data: signed, error: signError } = await db.storage
    .from("content-assets")
    .createSignedUrls(
      crops.map((row) => row.storage_path),
      MEDIA_URL_TTL_SECONDS,
    );

  if (signError || !signed) throw new Error(`Failed to sign media URLs for content ${contentId}: ${signError?.message}`);

  return crops.flatMap((row, index) => {
    const url = signed[index]?.signedUrl;
    return url ? [{ aspectRatio: row.aspect_ratio, url, recommended: row.aspect_ratio === recommended }] : [];
  });
}

/** Null when the version doesn't exist, or has no caption to export yet. */
export async function buildManualPack(
  versionId: string,
  db: SupabaseClient<Database> = supabaseServer(),
): Promise<ManualPack | null> {
  const { data, error } = await db
    .from("content_versions")
    .select("id, platform, status, caption, content_id")
    .eq("id", versionId)
    .maybeSingle<VersionRow>();

  if (error) throw new Error(`Failed to load version ${versionId}: ${error.message}`);
  if (!data) return null;

  const caption = data.caption as CaptionAgentOutput | null;
  if (!caption) return null;

  return {
    versionId: data.id,
    platform: data.platform,
    status: data.status,
    // The same assembly every connector uses, so what the founder pastes is
    // exactly what the API would have sent (connectors/captionText.ts).
    caption: assembleCaption(caption),
    firstComment: caption.first_comment,
    assets: await signedAssets(db, data.content_id, data.platform),
    warnings: caption.warnings ?? [],
    generatedAt: new Date().toISOString(),
  };
}
