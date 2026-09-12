import "server-only";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { config } from "@/lib/config";
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

/**
 * Phase 17 — lets the founder confirm the Rules.md §1.1 safety gate for
 * *this* deployment without digging through Vercel's env var UI. Read-only:
 * these two vars must never be silently changed by the AI, so there is no
 * toggle here, only the truth of what's currently deployed.
 */
function SafetyGate() {
  const autoPublish = config.autoPublish;
  const approvalRequired = config.humanApprovalRequired;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing safety</CardTitle>
        <CardDescription>
          Rules.md §1.1: nothing publishes without your approval. This reads AUTO_PUBLISH and
          HUMAN_APPROVAL_REQUIRED directly from this deployment&apos;s environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <span>Auto-publish</span>
          <Badge variant={autoPublish ? "destructive" : "outline"}>{autoPublish ? "ON" : "OFF"}</Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <span>Human approval required</span>
          <Badge variant={approvalRequired ? "default" : "destructive"}>{approvalRequired ? "ON" : "OFF"}</Badge>
        </div>
        {autoPublish && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            Auto-publish is on for this deployment — content can go out the moment it&apos;s scheduled, with
            no approval click in between. The recommended default is off.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

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

      <SafetyGate />
      <PlatformConnections connectable={CONNECTABLE} connections={connections} />
      <VoiceProfileForm brandId={brandId} initialProfile={voiceProfile} />
    </div>
  );
}
