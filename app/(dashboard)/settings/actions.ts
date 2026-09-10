"use server";

import { revalidatePath } from "next/cache";
import { updateBrandVoice } from "@/services/brandVoice";
import { voiceProfileSchema, type VoiceProfile } from "@/types/brandVoice";

export type SaveVoiceProfileResult = { ok: true } | { ok: false; error: string };

export async function saveVoiceProfile(brandId: string, profile: VoiceProfile): Promise<SaveVoiceProfileResult> {
  const parsed = voiceProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }

  try {
    await updateBrandVoice(brandId, parsed.data);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save brand voice" };
  }

  revalidatePath("/settings");
  return { ok: true };
}
