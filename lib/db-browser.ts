/**
 * Browser-safe Supabase client (anon key, RLS-respecting).
 *
 * Split from lib/db.ts because that file imports the `server-only` guard —
 * bundling them together would make the anon client unusable from Client
 * Components too. This is the only client-importable DB entry point.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | null = null;

export function supabaseBrowser(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createClient<Database>(config.supabase.url, config.supabase.anonKey);
  }
  return browserClient;
}
