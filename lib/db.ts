/**
 * The two, and only two, ways this app talks to Postgres.
 *
 * - `supabaseBrowser()` — anon key, safe to call from Client Components.
 * - `supabaseServer()`  — service-role key, full table access, bypasses RLS.
 *   Guarded by `server-only`: importing this file from a Client Component
 *   is a build error, not a runtime leak. See Rules.md §1.6.
 *
 * `types/database.ts` is regenerated from the live schema in Phase 1 via
 * `npm run db:types`; until then it's a hand-written placeholder so this
 * file (and everything that imports it) compiles.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { Database } from "@/types/database";

let serverClient: SupabaseClient<Database> | null = null;

/** Server-side client with full table access. Route Handlers / server actions only. */
export function supabaseServer(): SupabaseClient<Database> {
  if (!serverClient) {
    serverClient = createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return serverClient;
}
