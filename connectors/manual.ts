/**
 * Fallback connector for any platform with no publishing API (or one we
 * haven't built a real connector for yet). Every call correctly resolves
 * to READY_TO_POST / NOT_SUPPORTED — it never claims success it can't
 * back up (Rules.md §1.3).
 */
import type { PlatformConnector, PublishResult, PostStatus, PlatformAnalytics, ConnectionStatus } from "./base";
import type { Platform } from "@/types/enums";

export function manualConnector(platform: Platform): PlatformConnector {
  return {
    platform,

    async validateConnection(): Promise<ConnectionStatus> {
      return { ok: false, reason: `${platform} has no publishing API — content is exported manually.` };
    },

    async publish(): Promise<PublishResult> {
      return { status: "READY_TO_POST", reason: "NOT_SUPPORTED" };
    },

    async getStatus(): Promise<PostStatus> {
      return { status: "unknown", reason: `${platform} has no publishing API — a manual post's status can't be read back.` };
    },

    async getAnalytics(): Promise<PlatformAnalytics> {
      return {
        impressions: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        clicks: null,
        fetchedAt: new Date().toISOString(),
      };
    },
  };
}
