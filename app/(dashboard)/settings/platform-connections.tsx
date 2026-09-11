"use client";

/**
 * Architecture.md §4's "connected platforms" half of /settings.
 *
 * Only platforms with a real connector are listed. Everything else resolves
 * to the manual READY_TO_POST export and has nothing to connect, so offering
 * a Connect button for them would promise something that doesn't exist
 * (Rules.md §1.3).
 *
 * Connect is a plain link, not an action: OAuth needs a top-level browser
 * navigation to LinkedIn and back, which a server action can't do.
 */
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionState, ConnectionSummary } from "@/services/platformConnections";
import type { Platform } from "@/types/enums";
import { checkConnection, disconnectPlatform } from "./actions";

export interface ConnectablePlatform {
  platform: Platform;
  label: string;
  startPath: string;
}

const STATE_BADGE: Record<ConnectionState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  connected: { label: "Connected", variant: "default" },
  broken: { label: "Needs re-auth", variant: "destructive" },
  disconnected: { label: "Not connected", variant: "outline" },
};

function expiryNote(connection: ConnectionSummary | undefined): string | null {
  if (!connection?.expiresAt) return null;
  const expiresAt = new Date(connection.expiresAt);
  const days = Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return days > 0 ? `Token valid for ${days} more day${days === 1 ? "" : "s"}` : "Token has expired";
}

export function PlatformConnections({
  connectable,
  connections,
}: {
  connectable: ConnectablePlatform[];
  connections: ConnectionSummary[];
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected platforms</CardTitle>
        <CardDescription>
          Publishing needs a live connection. Platforms without one here are exported and posted by hand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connectable.map((entry) => {
          const connection = connections.find((item) => item.platform === entry.platform);
          const state = connection?.state ?? "disconnected";
          const badge = STATE_BADGE[state];
          const note = expiryNote(connection);

          return (
            <div key={entry.platform} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{entry.label}</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {connection?.platformAccountId ? `Posting as ${connection.platformAccountId}` : "No account linked yet"}
                  {note ? ` · ${note}` : ""}
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={state === "disconnected" || isPending} onClick={() => run(() => checkConnection(entry.platform))}>
                  Check
                </Button>
                <Button size="sm" variant="outline" disabled={state === "disconnected" || isPending} onClick={() => run(() => disconnectPlatform(entry.platform))}>
                  Disconnect
                </Button>
                <Button size="sm" render={<a href={entry.startPath} />}>
                  {state === "disconnected" ? "Connect" : "Reconnect"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
