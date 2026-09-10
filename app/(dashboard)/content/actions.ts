"use server";

/**
 * Phase 9 approval screen actions (Phases.md: "Build Edit / Approve /
 * Reject / Regenerate actions"). Every write here goes through
 * services/approvalWorkflow.ts's status-transition rules first — this file
 * never writes a content_versions.status value the workflow module didn't
 * produce, so the rules stay in one testable place.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/db";
import { GenerateError, runContentGenerate } from "@/services/contentGenerator";
import { isDecidable, isEditable, isRegeneratable, statusAfterDecision, statusAfterEdit, type ReviewDecision } from "@/services/approvalWorkflow";
import type { CaptionAgentOutput } from "@/types/agents";
import type { Json } from "@/types/database";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function decideVersion(versionId: string, decision: ReviewDecision): Promise<ActionResult> {
  const db = supabaseServer();

  const { data: version, error } = await db.from("content_versions").select("status").eq("id", versionId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!version) return { ok: false, error: "That content version no longer exists" };
  if (!isDecidable(version.status)) {
    return { ok: false, error: `Cannot ${decision} a version that is already ${version.status}` };
  }

  const { error: updateError } = await db
    .from("content_versions")
    .update({ status: statusAfterDecision(decision) })
    .eq("id", versionId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/content");
  return { ok: true };
}

export type CaptionEdit = Omit<CaptionAgentOutput, "warnings">;

export async function editCaption(versionId: string, edit: CaptionEdit): Promise<ActionResult> {
  const db = supabaseServer();

  const { data: version, error } = await db.from("content_versions").select("status, caption").eq("id", versionId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!version) return { ok: false, error: "That content version no longer exists" };
  if (!isEditable(version.status)) {
    return { ok: false, error: `Cannot edit a version that is already ${version.status}` };
  }

  // A hand-edit is a human overriding the Caption Agent, not the agent
  // speaking again — carry forward its warnings (e.g. a missing CTA flag)
  // rather than inventing new ones here.
  const existingWarnings = (version.caption as CaptionAgentOutput | null)?.warnings ?? [];
  const nextCaption: Json = { ...edit, warnings: existingWarnings } as unknown as Json;

  const { error: updateError } = await db
    .from("content_versions")
    .update({ caption: nextCaption, status: statusAfterEdit() })
    .eq("id", versionId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/content");
  return { ok: true };
}

export async function regenerateContent(contentId: string): Promise<ActionResult> {
  const db = supabaseServer();

  const { data: versions, error } = await db.from("content_versions").select("status").eq("content_id", contentId);
  if (error) return { ok: false, error: error.message };

  const blocked = (versions ?? []).find((version) => !isRegeneratable(version.status));
  if (blocked) {
    return { ok: false, error: `Cannot regenerate — a version for this content is already ${blocked.status}` };
  }

  try {
    await runContentGenerate(db, contentId);
  } catch (err) {
    if (err instanceof GenerateError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Failed to regenerate content" };
  }

  // The pipeline never writes content_versions.status itself (see
  // services/contentGenerator.ts's header comment) — every version it just
  // rewrote needs a fresh human decision, the same reopening editCaption()
  // applies to a single version, just across all of this content's platforms.
  const { error: statusError } = await db
    .from("content_versions")
    .update({ status: statusAfterEdit() })
    .eq("content_id", contentId);
  if (statusError) return { ok: false, error: statusError.message };

  revalidatePath("/content");
  return { ok: true };
}
