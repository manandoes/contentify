/**
 * Phase 11's first real connector (Phases.md Phase 11: "Pick one platform
 * with a straightforward API ... learn OAuth properly on this one before
 * repeating it elsewhere").
 *
 * LinkedIn, because it is one of the two platforms Phase 6 already adapts
 * for, its write scope is self-serve rather than review-gated, and a text or
 * single-image member post is one documented POST.
 *
 * Endpoints verified against Microsoft Learn during this build (Posts API,
 * Images API, little Text Format, 3-legged OAuth) rather than recalled:
 *  - POST /rest/posts, with the created post's URN in the `x-restli-id`
 *    response header.
 *  - POST /rest/images?action=initializeUpload, then PUT the bytes to the
 *    returned uploadUrl.
 *  - Every versioned call needs `LinkedIn-Version: YYYYMM` and
 *    `X-Restli-Protocol-Version: 2.0.0`.
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
import type { OAuthFlow } from "../oauthFlow";
import { buildCommentary } from "./commentary";
import { REQUIRED_SCOPES, authorizationUrl, exchangeCode, fetchMemberUrn, linkedInAppConfig, refreshTokens } from "./oauth";

const NOT_CONFIGURED = "LinkedIn is not configured — set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and LINKEDIN_REDIRECT_URI.";

const API_BASE = "https://api.linkedin.com";
/**
 * LinkedIn versions its APIs by month and sunsets each one about a year out,
 * so this is a value to bump deliberately, not a floating "latest". Set to
 * the version current when Phase 11 was built and verified.
 */
const API_VERSION = "202608";

/** Refresh this far ahead of expiry so a publish never races the boundary. */
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const WRITE_SCOPE = "w_member_social";

function versionedHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/** LinkedIn returns errors as JSON with a `message`; fall back to the status when it doesn't. */
async function describeError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return `${parsed.message} (HTTP ${response.status})`;
  } catch {
    // not JSON — fall through
  }
  return body ? `HTTP ${response.status}: ${body.slice(0, 300)}` : `HTTP ${response.status}`;
}

class PublishFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/**
 * Rules.md §3, three rows at once: 5xx is "API is down" (retry with backoff,
 * which the caller paces), 429 is "rate limit hit" (respect retry-after,
 * queue for later), and 401 means the token died mid-flight, which is
 * terminal for this attempt — the connection is marked broken and the
 * founder re-auths.
 */
async function failureFrom(response: Response, db: SupabaseClient<Database>): Promise<PublishFailure> {
  const detail = await describeError(response);

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new PublishFailure(
      `LinkedIn rate limit hit: ${detail}`,
      true,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  if (response.status === 401) {
    await markBroken("linkedin", db);
    return new PublishFailure(`LinkedIn rejected the access token: ${detail}. Reconnect LinkedIn in Settings.`, false);
  }

  return new PublishFailure(`LinkedIn API error: ${detail}`, response.status >= 500);
}

/**
 * Returns a credential set whose access token is valid now, refreshing it
 * first if it is close to expiry. When LinkedIn never issued a refresh token
 * (it only does so for approved apps), an expiring token has no automatic
 * path forward, so the connection is marked broken and the founder is told to
 * reconnect — never left to fail silently at the next publish.
 */
async function freshCredentials(db: SupabaseClient<Database>): Promise<PlatformCredentials> {
  const app = linkedInAppConfig();
  if (!app) throw new Error(NOT_CONFIGURED);

  const credentials = await getCredentials("linkedin", db);
  if (!credentials) throw new Error("LinkedIn is not connected — connect it in Settings.");
  if (credentials.state === "broken") throw new Error("The LinkedIn connection is broken — reconnect it in Settings.");

  const expiresAt = credentials.expiresAt ? Date.parse(credentials.expiresAt) : null;
  const expiringSoon = expiresAt !== null && expiresAt - Date.now() < REFRESH_WINDOW_MS;
  if (!expiringSoon) return credentials;

  if (!credentials.refreshToken) {
    await markBroken("linkedin", db);
    throw new Error(
      "The LinkedIn access token has expired and this app was not issued a refresh token — reconnect LinkedIn in Settings.",
    );
  }

  try {
    const refreshed = await refreshTokens(app, credentials.refreshToken);
    await saveConnection(
      {
        platform: "linkedin",
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? credentials.refreshToken,
        scopes: refreshed.scopes,
        expiresAt: refreshed.expiresAt,
        platformAccountId: credentials.platformAccountId,
      },
      db,
    );
    return { ...credentials, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, scopes: refreshed.scopes };
  } catch (error) {
    await markBroken("linkedin", db);
    throw new Error(`Refreshing the LinkedIn token failed (${(error as Error).message}) — reconnect LinkedIn in Settings.`);
  }
}

/** Images API: register the upload, PUT the bytes, return the image URN for the post body. */
async function uploadImage(accessToken: string, ownerUrn: string, imageUrl: string, db: SupabaseClient<Database>): Promise<string> {
  const initResponse = await fetch(`${API_BASE}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: { ...versionedHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });
  if (!initResponse.ok) throw await failureFrom(initResponse, db);

  const init = (await initResponse.json()) as { value?: { uploadUrl?: string; image?: string } };
  const uploadUrl = init.value?.uploadUrl;
  const imageUrn = init.value?.image;
  if (!uploadUrl || !imageUrn) throw new PublishFailure("LinkedIn's image upload initialization returned no upload URL", true);

  const source = await fetch(imageUrl);
  if (!source.ok) {
    // Rules.md §3 "Invalid media" — a clear, specific error, not a generic publish failure.
    throw new PublishFailure(`Could not read the media for this post (HTTP ${source.status} fetching the stored asset)`, false);
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: Buffer.from(await source.arrayBuffer()),
  });
  if (!upload.ok) throw await failureFrom(upload, db);

  return imageUrn;
}

export function linkedinConnector(db: SupabaseClient<Database> = supabaseServer()): PlatformConnector {
  return {
    platform: "linkedin",

    /**
     * Rules.md §3 "Missing permission/scope": scopes are checked here, at
     * connection time, not at publish time — and the token is exercised
     * against a real endpoint, so "connected" means "we just used it", not
     * "we have a string on file".
     */
    async validateConnection(): Promise<ConnectionStatus> {
      if (!linkedInAppConfig()) {
        return { ok: false, reason: NOT_CONFIGURED };
      }

      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch (error) {
        return { ok: false, reason: (error as Error).message };
      }

      const missing = REQUIRED_SCOPES.filter((scope) => !credentials.scopes.includes(scope));
      if (missing.length > 0) {
        return { ok: false, reason: `The LinkedIn connection is missing the ${missing.join(", ")} scope(s) — reconnect to grant them.` };
      }

      try {
        const memberUrn = await fetchMemberUrn(credentials.accessToken);
        if (credentials.platformAccountId && credentials.platformAccountId !== memberUrn) {
          return { ok: false, reason: "This token now belongs to a different LinkedIn member than the one connected — reconnect LinkedIn." };
        }
        return { ok: true };
      } catch (error) {
        await markBroken("linkedin", db);
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
        return { status: "FAILED", error: `The LinkedIn connection lacks the ${WRITE_SCOPE} scope — reconnect it in Settings.`, retryable: false };
      }

      const author = credentials.platformAccountId;
      if (!author) {
        return { status: "FAILED", error: "The LinkedIn connection has no member URN on file — reconnect it in Settings.", retryable: false };
      }

      // buildCommentary deliberately leaves out caption.first_comment: it is
      // a separate comment on the finished post (LinkedIn's Social Actions
      // API), not part of the post. The post itself goes out exactly as
      // approved; posting the follow-up comment is not built yet, and
      // nothing here claims otherwise.
      const commentary = buildCommentary(content.caption);
      const maxLength = PLATFORM_RULES.linkedin.maxLength;
      if (commentary.length > maxLength) {
        // Terminal by construction: the same caption will be the same length
        // on every retry. The founder edits it or it never goes out.
        return { status: "FAILED", error: `This caption is ${commentary.length} characters — LinkedIn allows ${maxLength}. Edit it and try again.`, retryable: false };
      }

      // One image per post is what the Posts API's `content.media` holds;
      // multiple images are a different endpoint (MultiImage API) and a
      // later phase. Silently dropping the extras would publish something
      // the founder didn't approve, so this refuses instead.
      if (content.mediaUrls.length > 1) {
        return { status: "FAILED", error: `This version has ${content.mediaUrls.length} media files — LinkedIn posts here carry at most one.`, retryable: false };
      }

      try {
        const body: Record<string, unknown> = {
          author,
          commentary,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        };

        if (content.mediaUrls.length === 1) {
          body.content = { media: { id: await uploadImage(credentials.accessToken, author, content.mediaUrls[0], db) } };
        }

        const response = await fetch(`${API_BASE}/rest/posts`, {
          method: "POST",
          // LinkedIn's Posts API documents no idempotency header, so a
          // second POST here really would be a second post on the feed.
          // Duplicate protection is therefore entirely ours — see the
          // published_posts guard in services/publisher.ts and the unique
          // index the Phase 11 migration adds behind it (Rules.md §3).
          headers: { ...versionedHeaders(credentials.accessToken), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) throw await failureFrom(response, db);

        const platformPostId = response.headers.get("x-restli-id");
        if (!platformPostId) {
          // A 201 with no URN means we cannot prove what was created, and
          // cannot safely retry. Surface it rather than record a guess.
          return {
            status: "FAILED",
            error: "LinkedIn accepted the post but returned no post id — check the LinkedIn feed before retrying.",
            retryable: false,
          };
        }

        return { status: "PUBLISHED", platformPostId, publishedAt: new Date().toISOString() };
      } catch (error) {
        if (error instanceof PublishFailure) {
          return { status: "FAILED", error: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds };
        }
        // The request never completed, so whether LinkedIn created the post
        // is genuinely unknown — and with no platform-side idempotency,
        // retrying blindly could double-post. Rules.md §3 says confirm the
        // previous attempt's real outcome first, so this is not retryable:
        // the founder checks the feed and decides.
        return {
          status: "FAILED",
          error: `Could not reach LinkedIn (${(error as Error).message}) — check the LinkedIn feed before retrying, the post may or may not have gone out.`,
          retryable: false,
        };
      }
    },

    /**
     * Reading a member's own post back needs `r_member_social`, which is
     * restricted to approved apps — so this usually cannot answer, and says
     * so instead of guessing (Rules.md §1.3).
     */
    async getStatus(platformPostId: string): Promise<PostStatus> {
      let credentials: PlatformCredentials;
      try {
        credentials = await freshCredentials(db);
      } catch (error) {
        return { status: "unknown", reason: (error as Error).message };
      }

      const response = await fetch(`${API_BASE}/rest/posts/${encodeURIComponent(platformPostId)}?viewContext=AUTHOR`, {
        headers: versionedHeaders(credentials.accessToken),
      }).catch(() => null);

      if (!response) return { status: "unknown", reason: "Could not reach LinkedIn." };
      if (response.status === 403) {
        return { status: "unknown", reason: "Reading posts back needs LinkedIn's restricted r_member_social permission, which this app doesn't have." };
      }
      if (!response.ok) return { status: "unknown", reason: await describeError(response) };

      const post = (await response.json().catch(() => ({}))) as { lifecycleState?: string };
      switch (post.lifecycleState) {
        case "PUBLISHED":
          return { status: "live" };
        case "PUBLISH_FAILED":
          return { status: "failed", error: "LinkedIn could not process this post." };
        case "DRAFT":
        case "PROCESSING":
        case "PUBLISH_REQUESTED":
          return { status: "pending" };
        default:
          return { status: "unknown", reason: `LinkedIn reported an unrecognised lifecycle state: ${post.lifecycleState ?? "none"}` };
      }
    },

    /**
     * LinkedIn exposes no member-post metrics under `w_member_social` —
     * impressions and engagement live behind `r_member_social` (restricted)
     * or belong to organization pages. Every field is therefore null, which
     * is the honest answer, not a placeholder: Rules.md §4 requires storing
     * null for anything a platform doesn't expose rather than estimating.
     * Phase 13 revisits this if the app is ever granted that access.
     */
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

/**
 * Completes the OAuth callback: swap the code for tokens, learn which member
 * they act as, store them encrypted. Lives here rather than in the route so
 * the route stays a thin HTTP shell and everything LinkedIn-shaped is in this
 * folder (Architecture.md §6: "adding a platform later is one new folder").
 */
export async function completeLinkedInConnection(code: string, db: SupabaseClient<Database> = supabaseServer()): Promise<void> {
  const app = linkedInAppConfig();
  if (!app) throw new Error(NOT_CONFIGURED);

  const tokens = await exchangeCode(app, code);

  const missing = REQUIRED_SCOPES.filter((scope) => !tokens.scopes.includes(scope));
  if (missing.length > 0) {
    throw new Error(`LinkedIn granted ${tokens.scopes.join(", ") || "no scopes"} — publishing needs ${missing.join(", ")} as well.`);
  }

  const memberUrn = await fetchMemberUrn(tokens.accessToken);

  await saveConnection(
    {
      platform: "linkedin",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      platformAccountId: memberUrn,
    },
    db,
  );
}

/** The browser OAuth flow, handed to the shared start/callback routes. */
export const linkedInOAuthFlow: OAuthFlow = {
  platform: "linkedin",
  label: "LinkedIn",
  notConfigured: NOT_CONFIGURED,
  authorizationUrl(state) {
    const app = linkedInAppConfig();
    return app ? authorizationUrl(app, state) : null;
  },
  complete: (code) => completeLinkedInConnection(code),
};
