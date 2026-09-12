/**
 * Phase 12's real connector (Phases.md Phase 12: "Add connectors one at a
 * time, same interface each time").
 *
 * Instagram, because it is the only other platform the Phase 6 adapter
 * actually produces content for — every other platform in types/enums.ts
 * has no content_versions to publish, so a connector for it would be code
 * nothing can reach. Those platforms are served by the manual export pack
 * (services/manualPack.ts) instead, which is the other half of this phase.
 *
 * Endpoints verified against developers.facebook.com during this build
 * (Content Publishing, Business Login, Media Insights) rather than recalled:
 *  - POST /<IG_ID>/media with `image_url` + `caption` → a container id
 *  - GET  /<CONTAINER_ID>?fields=status_code → EXPIRED | ERROR | FINISHED |
 *    IN_PROGRESS | PUBLISHED
 *  - POST /<IG_ID>/media_publish with `creation_id` → the published media id
 *  - GET  /<MEDIA_ID>/insights?metric=…
 *
 * The two-step container model is the real difference from LinkedIn: a post
 * is created, then separately published. Only the second call puts anything
 * on the feed, so a failure before it is always safe to retry.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/db";
import {
  getCredentials,
  markBroken,
  saveConnection,
  type PlatformCredentials,
} from "@/services/platformConnections";
import { PLATFORM_RULES } from "@/types/platformRules";
import type { Database } from "@/types/database";
import type {
  ConnectionStatus,
  PlatformAnalytics,
  PlatformConnector,
  PostStatus,
  PublishableContent,
  PublishResult,
} from "../base";
import { assembleCaption } from "../captionText.ts";
import type { OAuthFlow } from "../oauthFlow";
import {
  GRAPH_BASE_URL,
  INSIGHTS_SCOPE,
  NOT_CONFIGURED,
  REQUIRED_SCOPES,
  authorizationUrl,
  exchangeCode,
  fetchAccount,
  instagramAppConfig,
  refreshTokens,
} from "./oauth";

const WRITE_SCOPE = "instagram_business_content_publish";

/**
 * Instagram's long-lived token lasts 60 days and may only be refreshed once
 * it is at least 24 hours old. Refreshing a week out sits comfortably inside
 * both bounds, so a publish never races the expiry boundary and a refresh is
 * never rejected for being too early.
 */
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Instagram allows at most 30 hashtags on a post; a 31st rejects the whole thing. */
const MAX_HASHTAGS = 30;

/** A container for a single image finishes in seconds. Beyond this it is queued, not broken. */
const CONTAINER_POLL_ATTEMPTS = 5;
const CONTAINER_POLL_DELAY_MS = 2000;

class PublishFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

interface MetaError {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function readError(response: Response): Promise<{ detail: string; code: number | null }> {
  const body = await response.text().catch(() => "");
  const fallback = body ? `HTTP ${response.status}: ${body.slice(0, 300)}` : `HTTP ${response.status}`;

  try {
    const parsed = JSON.parse(body) as MetaError;
    // The code is read even when there is no message: it is what tells a rate
    // limit from a permanent error, and losing it would retry the wrong things.
    if (parsed.error) {
      return {
        detail: parsed.error.message ? `${parsed.error.message} (HTTP ${response.status})` : fallback,
        code: parsed.error.code ?? null,
      };
    }
  } catch {
    // not JSON — fall through
  }
  return { detail: fallback, code: null };
}

/**
 * Rules.md §3, three rows at once. Meta signals rate limiting with its own
 * error codes (4 = app-level, 17 = user-level, 32/613 = page/call-count) far
 * more often than with HTTP 429, so the code is what's checked, not just the
 * status. 190 is "token invalid or expired", which is terminal for this
 * attempt — the connection is marked broken and the founder re-auths.
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

async function failureFrom(response: Response, db: SupabaseClient<Database>): Promise<PublishFailure> {
  const { detail, code } = await readError(response);

  if (response.status === 429 || (code !== null && RATE_LIMIT_CODES.has(code))) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new PublishFailure(
      `Instagram rate limit hit: ${detail}`,
      true,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  if (response.status === 401 || code === 190) {
    await markBroken("instagram", db);
    return new PublishFailure(`Instagram rejected the access token: ${detail}. Reconnect Instagram in Settings.`, false);
  }

  return new PublishFailure(`Instagram API error: ${detail}`, response.status >= 500);
}

/**
 * Returns a credential set whose access token is valid now, refreshing it
 * first if it is close to expiry. Instagram issues no separate refresh token
 * — the long-lived access token refreshes itself — so there is no "was a
 * refresh token issued?" branch here, unlike LinkedIn.
 */
async function freshCredentials(db: SupabaseClient<Database>): Promise<PlatformCredentials> {
  if (!instagramAppConfig()) throw new Error(NOT_CONFIGURED);

  const credentials = await getCredentials("instagram", db);
  if (!credentials) throw new Error("Instagram is not connected — connect it in Settings.");
  if (credentials.state === "broken") throw new Error("The Instagram connection is broken — reconnect it in Settings.");

  const expiresAt = credentials.expiresAt ? Date.parse(credentials.expiresAt) : null;
  if (expiresAt === null || expiresAt - Date.now() >= REFRESH_WINDOW_MS) return credentials;

  if (expiresAt <= Date.now()) {
    // Past expiry there is nothing left to refresh — Instagram only extends a
    // token that is still alive. Re-auth is the only way forward, so say so.
    await markBroken("instagram", db);
    throw new Error("The Instagram access token has expired and can no longer be refreshed — reconnect Instagram in Settings.");
  }

  try {
    const refreshed = await refreshTokens(credentials.accessToken);
    await saveConnection(
      {
        platform: "instagram",
        accessToken: refreshed.accessToken,
        refreshToken: null,
        scopes: credentials.scopes,
        expiresAt: refreshed.expiresAt,
        platformAccountId: credentials.platformAccountId,
      },
      db,
    );
    return { ...credentials, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  } catch (error) {
    await markBroken("instagram", db);
    throw new Error(`Refreshing the Instagram token failed (${(error as Error).message}) — reconnect Instagram in Settings.`);
  }
}

async function graphPost(
  path: string,
  accessToken: string,
  body: Record<string, string>,
  db: SupabaseClient<Database>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${GRAPH_BASE_URL}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failureFrom(response, db);
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Meta ingests the image asynchronously, so a container is not publishable
 * the instant it is created. Publishing an unfinished container fails; this
 * waits for FINISHED and translates every other terminal state into a
 * specific error rather than a generic publish failure (Rules.md §3
 * "Invalid media").
 */
async function awaitContainerReady(
  containerId: string,
  accessToken: string,
  db: SupabaseClient<Database>,
): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    const url = new URL(`${GRAPH_BASE_URL}/${containerId}`);
    url.searchParams.set("fields", "status_code,status");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw await failureFrom(response, db);

    const { status_code: statusCode, status } = (await response.json().catch(() => ({}))) as {
      status_code?: string;
      status?: string;
    };

    switch (statusCode) {
      case "FINISHED":
        return;
      case "ERROR":
        // Terminal: Instagram could not process this image, and the same
        // image will fail identically next time.
        throw new PublishFailure(
          `Instagram could not process the image for this post${status ? ` (${status})` : ""}. Check the media and try again.`,
          false,
        );
      case "EXPIRED":
        throw new PublishFailure("The Instagram upload expired before it could be published.", true);
      default:
        await wait(CONTAINER_POLL_DELAY_MS);
    }
  }

  // Still ingesting. Nothing has been published, so the next pass can safely
  // start over with a fresh container.
  throw new PublishFailure("Instagram is still processing the image for this post — queued for the next pass.", true);
}

export function instagramConnector(db: SupabaseClient<Database> = supabaseServer()): PlatformConnector {
  return {
    platform: "instagram",

    /**
     * Rules.md §3 "Missing permission/scope": scopes are checked here, at
     * connection time, not at publish time — and the token is exercised
     * against a real endpoint, so "connected" means "we just used it".
     */
    async validateConnection(): Promise<ConnectionStatus> {
      if (!instagramAppConfig()) return { ok: false, reason: NOT_CONFIGURED };

      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch (error) {
        return { ok: false, reason: (error as Error).message };
      }

      const missing = REQUIRED_SCOPES.filter((scope) => !credentials.scopes.includes(scope));
      if (missing.length > 0) {
        return { ok: false, reason: `The Instagram connection is missing the ${missing.join(", ")} scope(s) — reconnect to grant them.` };
      }

      try {
        const account = await fetchAccount(credentials.accessToken);
        if (credentials.platformAccountId && credentials.platformAccountId !== account.userId) {
          return { ok: false, reason: "This token now belongs to a different Instagram account than the one connected — reconnect Instagram." };
        }
        return { ok: true };
      } catch (error) {
        await markBroken("instagram", db);
        return { ok: false, reason: (error as Error).message };
      }
    },

    async publish(content: PublishableContent): Promise<PublishResult> {
      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch (error) {
        return { status: "FAILED", error: (error as Error).message, retryable: false };
      }

      if (!credentials.scopes.includes(WRITE_SCOPE)) {
        return { status: "FAILED", error: `The Instagram connection lacks the ${WRITE_SCOPE} scope — reconnect it in Settings.`, retryable: false };
      }

      const igId = credentials.platformAccountId;
      if (!igId) {
        return { status: "FAILED", error: "The Instagram connection has no account id on file — reconnect it in Settings.", retryable: false };
      }

      // Every check below is terminal by construction: the same version will
      // fail the same way on every retry. The founder fixes it or it never
      // goes out — retrying would only burn attempts.
      if (content.mediaUrls.length !== 1) {
        return {
          status: "FAILED",
          error:
            content.mediaUrls.length === 0
              ? "Instagram posts need an image — this version has no formatted media. Upload and format one first."
              : `This version has ${content.mediaUrls.length} media files — a single Instagram image post carries exactly one.`,
          retryable: false,
        };
      }

      if (content.caption.hashtags.length > MAX_HASHTAGS) {
        return {
          status: "FAILED",
          error: `This caption has ${content.caption.hashtags.length} hashtags — Instagram allows ${MAX_HASHTAGS}. Edit it and try again.`,
          retryable: false,
        };
      }

      // Plain text: Instagram's caption field has no markup, and a hashtag is
      // literally `#tag`. first_comment is deliberately left out — it is a
      // separate comment on the finished post, not part of the caption, and
      // posting it is not built yet.
      const caption = assembleCaption(content.caption);
      const maxLength = PLATFORM_RULES.instagram.maxLength;
      if (caption.length > maxLength) {
        return { status: "FAILED", error: `This caption is ${caption.length} characters — Instagram allows ${maxLength}. Edit it and try again.`, retryable: false };
      }

      try {
        // Step 1 creates a container. Nothing is on the feed yet, so any
        // failure up to and including the readiness poll is safe to retry.
        const container = await graphPost(
          `${igId}/media`,
          credentials.accessToken,
          { image_url: content.mediaUrls[0], caption },
          db,
        );
        const containerId = container.id;
        if (typeof containerId !== "string") {
          throw new PublishFailure("Instagram accepted the image but returned no container id.", true);
        }

        await awaitContainerReady(containerId, credentials.accessToken, db);

        // Step 2 is the only call that puts anything on the feed. Instagram
        // documents no idempotency key, so duplicate protection is entirely
        // ours — see the published_posts guard in services/publisher.ts and
        // the unique index behind it (Rules.md §3).
        const published = await graphPost(`${igId}/media_publish`, credentials.accessToken, { creation_id: containerId }, db);
        const platformPostId = published.id;
        if (typeof platformPostId !== "string") {
          // A success with no media id means we cannot prove what was created
          // and cannot safely retry. Surface it rather than record a guess.
          return {
            status: "FAILED",
            error: "Instagram accepted the post but returned no media id — check the Instagram feed before retrying.",
            retryable: false,
          };
        }

        return { status: "PUBLISHED", platformPostId, publishedAt: new Date().toISOString() };
      } catch (error) {
        if (error instanceof PublishFailure) {
          return { status: "FAILED", error: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds };
        }
        // The request never completed. Whether Instagram published is
        // genuinely unknown, and with no platform-side idempotency a blind
        // retry could double-post, so Rules.md §3's "confirm the previous
        // attempt's outcome first" applies: not retryable, the founder looks.
        return {
          status: "FAILED",
          error: `Could not reach Instagram (${(error as Error).message}) — check the Instagram feed before retrying, the post may or may not have gone out.`,
          retryable: false,
        };
      }
    },

    /**
     * A published media object either resolves or it doesn't — Instagram
     * keeps no lifecycle state on it the way LinkedIn does, so "it is
     * fetchable" is the whole answer, and anything else is reported as
     * unknown rather than guessed at (Rules.md §1.3).
     */
    async getStatus(platformPostId: string): Promise<PostStatus> {
      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch (error) {
        return { status: "unknown", reason: (error as Error).message };
      }

      const url = new URL(`${GRAPH_BASE_URL}/${platformPostId}`);
      url.searchParams.set("fields", "id,permalink");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }).catch(() => null);

      if (!response) return { status: "unknown", reason: "Could not reach Instagram." };
      if (response.ok) return { status: "live" };

      const { detail } = await readError(response);
      return { status: "unknown", reason: detail };
    },

    /**
     * Unlike LinkedIn, Instagram does expose per-post metrics — but only
     * with the optional insights scope, and only for professional accounts
     * over the follower threshold Meta applies. Anything not returned stays
     * null rather than being estimated (Rules.md §4). Phase 13 stores these;
     * this is the connector's half of that contract.
     *
     * `clicks` is null by design: Instagram publishes no per-post link-click
     * metric for a feed image, so there is nothing honest to put there.
     */
    async getAnalytics(platformPostId: string): Promise<PlatformAnalytics> {
      const empty: PlatformAnalytics = {
        impressions: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        clicks: null,
        fetchedAt: new Date().toISOString(),
      };

      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch {
        return empty;
      }

      if (!credentials.scopes.includes(INSIGHTS_SCOPE)) return empty;

      const url = new URL(`${GRAPH_BASE_URL}/${platformPostId}/insights`);
      // `impressions` was deprecated for media created after 2 July 2024 and
      // replaced by `views` — requesting the dead name would fail the whole
      // call, so `views` is what fills the impressions field.
      url.searchParams.set("metric", "views,likes,comments,shares,saved");

      const response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }).catch(() => null);
      if (!response?.ok) return empty;

      const payload = (await response.json().catch(() => ({}))) as {
        data?: { name?: string; values?: { value?: number }[] }[];
      };

      const metrics = new Map<string, number>();
      for (const entry of payload.data ?? []) {
        const value = entry.values?.[0]?.value;
        if (entry.name && typeof value === "number") metrics.set(entry.name, value);
      }
      const read = (name: string) => metrics.get(name) ?? null;

      return {
        ...empty,
        impressions: read("views"),
        likes: read("likes"),
        comments: read("comments"),
        shares: read("shares"),
        saves: read("saved"),
      };
    },
  };
}

/**
 * Completes the OAuth callback: swap the code for a long-lived token, learn
 * which account it acts as, store it encrypted. Lives here rather than in the
 * route so the route stays a thin HTTP shell and everything Instagram-shaped
 * is in this folder (Architecture.md §6).
 */
export async function completeInstagramConnection(code: string, db: SupabaseClient<Database> = supabaseServer()): Promise<void> {
  const app = instagramAppConfig();
  if (!app) throw new Error(NOT_CONFIGURED);

  const tokens = await exchangeCode(app, code);

  const missing = REQUIRED_SCOPES.filter((scope) => !tokens.scopes.includes(scope));
  if (missing.length > 0) {
    throw new Error(`Instagram granted ${tokens.scopes.join(", ") || "no scopes"} — publishing needs ${missing.join(", ")} as well.`);
  }

  // Confirm the account against the token rather than trusting the id the
  // exchange echoed back, so what's stored is what publishing will address.
  const account = await fetchAccount(tokens.accessToken);

  await saveConnection(
    {
      platform: "instagram",
      accessToken: tokens.accessToken,
      refreshToken: null,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      platformAccountId: account.userId,
    },
    db,
  );
}

/** The browser OAuth flow, handed to the shared start/callback routes. */
export const instagramOAuthFlow: OAuthFlow = {
  platform: "instagram",
  label: "Instagram",
  notConfigured: NOT_CONFIGURED,
  authorizationUrl(state) {
    const app = instagramAppConfig();
    return app ? authorizationUrl(app, state) : null;
  },
  complete: (code) => completeInstagramConnection(code),
};
