"use server";

import { revalidatePath } from "next/cache";
import { getConnector } from "@/connectors";
import { updateBrandVoice } from "@/services/brandVoice";
import { disconnect } from "@/services/platformConnections";
import { voiceProfileSchema, type VoiceProfile } from "@/types/brandVoice";
import type { Platform } from "@/types/enums";

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

export type ConnectionActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Rules.md §3 "Missing permission/scope": scopes are verified at connection
 * time, not at publish time. This is the founder-triggered version of that
 * check — it re-runs the connector's own validateConnection(), which also
 * exercises the token against the platform, so "connected" on this screen
 * means something that was true a second ago.
 */
export async function checkConnection(platform: Platform): Promise<ConnectionActionResult> {
  let status;
  try {
    status = await getConnector(platform).validateConnection();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : `Failed to check the ${platform} connection` };
  }

  revalidatePath("/settings");
  return status.ok ? { ok: true, message: "Connection is live." } : { ok: false, error: status.reason };
}

export async function disconnectPlatform(platform: Platform): Promise<ConnectionActionResult> {
  try {
    await disconnect(platform);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : `Failed to disconnect ${platform}` };
  }

  revalidatePath("/settings");
  return { ok: true, message: `Disconnected ${platform}.` };
}
