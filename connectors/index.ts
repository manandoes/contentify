/**
 * Platform → connector lookup. The whole point of Architecture.md §6's one
 * shared shape is that services/publisher.ts never branches on platform;
 * this switch is the single place that knows which platforms have a real
 * connector, and everything else falls through to the manual
 * READY_TO_POST export (Rules.md §1.3).
 *
 * Phase 12 grows this by one case per platform and changes nothing else.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Platform } from "@/types/enums";
import type { PlatformConnector } from "./base";
import { linkedinConnector } from "./linkedin";
import { manualConnector } from "./manual";

export function getConnector(platform: Platform, db?: SupabaseClient<Database>): PlatformConnector {
  switch (platform) {
    case "linkedin":
      return linkedinConnector(db);
    default:
      return manualConnector(platform);
  }
}
