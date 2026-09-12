import "server-only";
import { getBrandVoice } from "@/services/brandVoice";
import { listConnections } from "@/services/platformConnections";
import { VoiceProfileForm } from "./voice-profile-form";
import { PlatformConnections, type ConnectablePlatform } from "./platform-connections";

// Always reflect the latest saved profile — settings changes must be
// visible immediately to whoever's editing, not served from a stale build.
export const dynamic = "force-dynamic";

/**
 * Only platforms with a real connector. The rest have no publishing API to
 * connect to and are posted by hand from the export pack, so offering them a
 * Connect button would promise something that doesn't exist (Rules.md §1.3).
 *
 * Adding a platform is a line here and a case in connectors/index.ts —
 * nothing else.
 */
const CONNECTABLE: ConnectablePlatform[] = [
  { platform: "linkedin", label: "LinkedIn", startPath: "/api/connections/linkedin/start" },
  { platform: "instagram", label: "Instagram", startPath: "/api/connections/instagram/start" },
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
