/**
 * Phase 8 (Architecture.md §2 Format Engine, Phases.md Phase 8). Accepts one
 * raw image for an existing `content` row, runs services/media.ts's
 * attention-preserving crop across every target aspect ratio, uploads the
 * original plus each crop to Supabase Storage, and writes one content_assets
 * row per asset (Phase 1 migration's schema already anticipates this
 * exactly — is_original + aspect_ratio + width/height).
 *
 * Same auth pattern as every other /api/content and /api/ideas route
 * (CRON_SECRET bearer via lib/config.ts) — there's no founder-facing upload
 * form yet (app/(dashboard)/content/page.tsx is still a Phase 9 stub), so
 * this is called directly, the same way Phase 5/6/7's ingest and generate
 * routes are (Implementationplan.md's Verification section tests those via
 * direct calls too).
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { formatImageAllRatios } from "@/services/media";
import type { Database } from "@/types/database";

type ContentAssetInsert = Database["public"]["Tables"]["content_assets"]["Insert"];

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Request body must be multipart/form-data" }, { status: 400 });
  }

  const contentId = form.get("contentId");
  const file = form.get("file");
  if (typeof contentId !== "string" || !contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: content, error: contentError } = await db.from("content").select("id").eq("id", contentId).maybeSingle();
  if (contentError) {
    return NextResponse.json({ error: `Failed to look up content ${contentId}: ${contentError.message}` }, { status: 500 });
  }
  if (!content) {
    return NextResponse.json({ error: `content ${contentId} not found` }, { status: 404 });
  }

  // Rules.md §3 "Invalid media" — validate type before upload, clear error.
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: `Unsupported asset type "${file.type}" — Phase 8's format engine handles images only, video formatting is a later phase` },
      { status: 400 },
    );
  }

  const originalBuffer = Buffer.from(await file.arrayBuffer());

  let formatted;
  try {
    formatted = await formatImageAllRatios(originalBuffer);
  } catch (error) {
    return NextResponse.json({ error: `Failed to format image: ${(error as Error).message}` }, { status: 400 });
  }

  const originalExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const originalPath = `${contentId}/original.${originalExt}`;

  const { error: originalUploadError } = await db.storage
    .from("content-assets")
    .upload(originalPath, originalBuffer, { contentType: file.type, upsert: true });
  if (originalUploadError) {
    return NextResponse.json({ error: `Failed to upload original asset: ${originalUploadError.message}` }, { status: 500 });
  }

  const assetRows: ContentAssetInsert[] = [
    { content_id: contentId, storage_path: originalPath, asset_type: "image", aspect_ratio: null, width: null, height: null, is_original: true },
  ];
  const warnings: string[] = [];

  for (const asset of formatted) {
    const path = `${contentId}/${asset.aspectRatio}.jpg`;
    const { error: uploadError } = await db.storage
      .from("content-assets")
      .upload(path, asset.buffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: `Failed to upload ${asset.aspectRatio} crop: ${uploadError.message}` }, { status: 500 });
    }

    assetRows.push({
      content_id: contentId,
      storage_path: path,
      asset_type: "image",
      aspect_ratio: asset.aspectRatio,
      width: asset.width,
      height: asset.height,
      is_original: false,
    });

    if (asset.safeZoneWarning) {
      warnings.push(`${asset.aspectRatio}: primary content may sit under platform UI (safe-zone check)`);
    }
  }

  const { data: inserted, error: insertError } = await db
    .from("content_assets")
    .insert(assetRows)
    .select("id, storage_path, asset_type, aspect_ratio, width, height, is_original");
  if (insertError) {
    return NextResponse.json({ error: `Failed to save content_assets for content ${contentId}: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ contentId, assets: inserted, warnings });
}
