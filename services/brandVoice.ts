/**
 * The single retrieval point every downstream agent and screen reads brand
 * voice through (Implementationplan.md Phase 4 / Block A pattern). Nothing
 * outside this file should select `brands.voice_profile` directly — that
 * way the zod defaults in types/brandVoice.ts are guaranteed applied
 * everywhere, and a future multi-brand migration only touches call sites
 * that pass an explicit brandId.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import { getBrandId } from "./orchestrator";
import { voiceProfileSchema, type VoiceProfile } from "@/types/brandVoice";
import type { Database, Json } from "@/types/database";

export interface BrandVoice {
  brandId: string;
  name: string;
  voiceProfile: VoiceProfile;
}

/** Reads the seeded brand's voice profile. Falls back to defaults if the stored JSON is malformed. */
export async function getBrandVoice(brandId?: string, db: SupabaseClient<Database> = supabaseServer()): Promise<BrandVoice> {
  const id = brandId ?? (await getBrandId(db));
  const { data, error } = await db.from("brands").select("id, name, voice_profile").eq("id", id).single();
  if (error || !data) {
    throw new Error(`Failed to load brand ${id}: ${error?.message}`);
  }

  const parsed = voiceProfileSchema.safeParse(data.voice_profile ?? {});
  return {
    brandId: data.id,
    name: data.name,
    voiceProfile: parsed.success ? parsed.data : voiceProfileSchema.parse({}),
  };
}

/** Validates and persists a full voice profile. Settings UI + any future seeding tools go through here. */
export async function updateBrandVoice(
  brandId: string,
  profile: VoiceProfile,
  db: SupabaseClient<Database> = supabaseServer(),
): Promise<VoiceProfile> {
  const validated = voiceProfileSchema.parse(profile);
  const { error } = await db
    .from("brands")
    .update({ voice_profile: validated as unknown as Json })
    .eq("id", brandId);

  if (error) {
    throw new Error(`Failed to update voice profile for brand ${brandId}: ${error.message}`);
  }
  return validated;
}
