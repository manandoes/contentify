import "server-only";
import { getBrandVoice } from "@/services/brandVoice";
import { listConnections } from "@/services/platformConnections";
import { VoiceProfileForm } from "./voice-profile-form";
import { PlatformConnections, type ConnectablePlatform } from "./platform-connections";

// Always reflect the latest saved profile — settings changes must be
// visible immediately to whoever's editing, not served from a stale build.
export const dynamic = "force-dynamic";

/**
 * Phase 11 ships one connector (Phases.md: "Pick one platform ... before
 * scaling to more"), so one entry. Phase 12 adds a line per platform here
 * and a case to connectors/index.ts — nothing else.
 */
const CONNECTABLE: ConnectablePlatform[] = [
  { platform: "linkedin", label: "LinkedIn", startPath: "/api/connections/linkedin/start" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connectionError?: string }>;
}) {
  const [{ brandId, voiceProfile }, connections, params] = await Promise.all([
    getBrandVoice(),
    listConnections(),
    searchParams,
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* The OAuth callback redirects back here with its outcome — the founder
          is returning from LinkedIn in a browser, so it has to be readable. */}
      {params.connected && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          Connected {params.connected}.
        </p>
      )}
      {params.connectionError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {params.connectionError}
        </p>
      )}

      <PlatformConnections connectable={CONNECTABLE} connections={connections} />
      <VoiceProfileForm brandId={brandId} initialProfile={voiceProfile} />
    </div>
  );
}
