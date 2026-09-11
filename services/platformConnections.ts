/**
 * The single read/write point for platform_connections — the Phase 11
 * equivalent of services/brandVoice.ts for brands.voice_profile.
 *
 * Everything token-shaped goes through here so that:
 *  - encryption is not optional (Rules.md §1.6). Nothing else imports
 *    lib/crypto.ts, so there is no code path that can write a plaintext token.
 *  - the founder-facing list (`listConnections`) is a *different* function
 *    from the publishing read (`getCredentials`), and returns no token
 *    material at all — a settings screen can never accidentally serialise a
 *    token into the page it ships to the browser.
 *
 * Refreshing is deliberately NOT here: the mechanics are per-platform, so
 * each connector owns its own refresh and calls saveConnection()/markBroken()
 * with the result (Rules.md §3 "Token expired").
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getBrandId } from "./orchestrator";
import type { Database } from "@/types/database";
import type { Platform } from "@/types/enums";

export type ConnectionState = "disconnected" | "connected" | "broken";

/** Includes decrypted tokens. Server-side publishing paths only — never returned to a page. */
export interface PlatformCredentials {
  connectionId: string;
  platform: Platform;
  state: ConnectionState;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
  platformAccountId: string | null;
}

/** Safe to render. Deliberately carries no token material. */
export interface ConnectionSummary {
  platform: Platform;
  state: ConnectionState;
  scopes: string[];
  expiresAt: string | null;
  connectedAt: string | null;
  platformAccountId: string | null;
}

export interface SaveConnectionInput {
  platform: Platform;
  accessToken: string;
  refreshToken?: string | null;
  scopes: string[];
  /** Absolute expiry. Callers convert the platform's `expires_in` before calling. */
  expiresAt: string | null;
  platformAccountId?: string | null;
  brandId?: string;
}

function toState(status: string): ConnectionState {
  return status === "connected" || status === "broken" ? status : "disconnected";
}

/**
 * Reads and decrypts one connection. Returns null when the platform was
 * never connected, or when the row carries no access token — a broken row is
 * returned as-is so callers can tell "never connected" from "needs re-auth".
 */
export async function getCredentials(
  platform: Platform,
  db: SupabaseClient<Database> = supabaseServer(),
  brandId?: string,
): Promise<PlatformCredentials | null> {
  const id = brandId ?? (await getBrandId(db));

  const { data, error } = await db
    .from("platform_connections")
    .select("id, platform, status, access_token_encrypted, refresh_token_encrypted, scopes, expires_at, platform_account_id")
    .eq("brand_id", id)
    .eq("platform", platform)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the ${platform} connection: ${error.message}`);
  if (!data || !data.access_token_encrypted) return null;

  return {
    connectionId: data.id,
    platform: data.platform,
    state: toState(data.status),
    accessToken: decryptSecret(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null,
    scopes: data.scopes,
    expiresAt: data.expires_at,
    platformAccountId: data.platform_account_id,
  };
}

/** Upserts a freshly-issued (or refreshed) token set and marks the connection healthy. */
export async function saveConnection(
  input: SaveConnectionInput,
  db: SupabaseClient<Database> = supabaseServer(),
): Promise<void> {
  const brandId = input.brandId ?? (await getBrandId(db));

  const { error } = await db.from("platform_connections").upsert(
    {
      brand_id: brandId,
      platform: input.platform,
      status: "connected",
      access_token_encrypted: encryptSecret(input.accessToken),
      refresh_token_encrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      scopes: input.scopes,
      expires_at: input.expiresAt,
      platform_account_id: input.platformAccountId ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "brand_id,platform" },
  );

  if (error) throw new Error(`Failed to save the ${input.platform} connection: ${error.message}`);
}

/**
 * Rules.md §3 "Token expired": when a refresh fails there is nothing valid
 * left to publish with, so the connection is marked broken and the founder is
 * prompted to re-auth from /settings. The stored token is cleared rather than
 * left to be retried — a token we already know is dead is not worth keeping.
 */
export async function markBroken(
  platform: Platform,
  db: SupabaseClient<Database> = supabaseServer(),
  brandId?: string,
): Promise<void> {
  const id = brandId ?? (await getBrandId(db));

  const { error } = await db
    .from("platform_connections")
    .update({ status: "broken", access_token_encrypted: null, refresh_token_encrypted: null })
    .eq("brand_id", id)
    .eq("platform", platform);

  if (error) throw new Error(`Failed to mark the ${platform} connection broken: ${error.message}`);
}

/** Founder-initiated disconnect from /settings. Drops the tokens, keeps the row's history. */
export async function disconnect(
  platform: Platform,
  db: SupabaseClient<Database> = supabaseServer(),
  brandId?: string,
): Promise<void> {
  const id = brandId ?? (await getBrandId(db));

  const { error } = await db
    .from("platform_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      scopes: [],
      expires_at: null,
      connected_at: null,
      platform_account_id: null,
    })
    .eq("brand_id", id)
    .eq("platform", platform);

  if (error) throw new Error(`Failed to disconnect ${platform}: ${error.message}`);
}

/** Every connection for the brand, token-free, for the /settings screen. */
export async function listConnections(
  db: SupabaseClient<Database> = supabaseServer(),
  brandId?: string,
): Promise<ConnectionSummary[]> {
  const id = brandId ?? (await getBrandId(db));

  const { data, error } = await db
    .from("platform_connections")
    .select("platform, status, scopes, expires_at, connected_at, platform_account_id")
    .eq("brand_id", id);

  if (error) throw new Error(`Failed to load platform connections: ${error.message}`);

  return (data ?? []).map((row) => ({
    platform: row.platform,
    state: toState(row.status),
    scopes: row.scopes,
    expiresAt: row.expires_at,
    connectedAt: row.connected_at,
    platformAccountId: row.platform_account_id,
  }));
}
