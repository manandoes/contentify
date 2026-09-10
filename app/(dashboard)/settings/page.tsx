import "server-only";
import { getBrandVoice } from "@/services/brandVoice";
import { VoiceProfileForm } from "./voice-profile-form";

// Always reflect the latest saved profile — settings changes must be
// visible immediately to whoever's editing, not served from a stale build.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { brandId, voiceProfile } = await getBrandVoice();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <VoiceProfileForm brandId={brandId} initialProfile={voiceProfile} />
    </div>
  );
}
