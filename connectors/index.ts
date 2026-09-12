/**
 * Platform → connector lookup. The whole point of Architecture.md §6's one
 * shared shape is that services/publisher.ts never branches on platform;
 * this switch is the single place that knows which platforms have a real
 * connector, and everything else falls through to the manual
 * READY_TO_POST export (Rules.md §1.3).
 *
 * Phase 12 added Instagram the same way — one case, nothing else touched.
 * The remaining platforms have no content_versions to publish (the Phase 6
 * adapter produces Instagram and LinkedIn only), so they resolve here to the
 * manual connector and are served by the export pack in
 * services/manualPack.ts.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Platform } from "@/types/enums";
import type { PlatformConnector } from "./base";
import { instagramConnector } from "./instagram";
import { linkedinConnector } from "./linkedin";
import { manualConnector } from "./manual";

export function getConnector(platform: Platform, db?: SupabaseClient<Database>): PlatformConnector {
  switch (platform) {
    case "linkedin":
      return linkedinConnector(db);
    case "instagram":
      return instagramConnector(db);
    default:
      return manualConnector(platform);
  }
}
