/**
 * Instagram Business Login, verified against
 * developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 * during this build — not recalled.
 *
 * Deliberately the *Instagram Login* variant, not Facebook Login: it
 * authorizes an Instagram professional account directly, with no Facebook
 * Page and no Page-to-IG-account discovery step in between. That is one
 * fewer thing to get wrong and one fewer thing that can silently change
 * under the founder later.
 *
 * The token dance has three steps, not two, and each has its own host:
 *  1. POST api.instagram.com/oauth/access_token → a 1-hour short-lived token
 *  2. GET  graph.instagram.com/access_token?grant_type=ig_exchange_token
 *          → a 60-day long-lived token
 *  3. GET  graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 *          → another 60 days
 *
 * Step 2 is not optional: a stored short-lived token would be dead an hour
 * after the founder connected, which is exactly the silent failure Rules.md
 * §3 wants avoided. Step 3 needs a token at least 24 hours old but not yet
 * expired, so the connector refreshes on a window inside those bounds.
 *
 * Unlike LinkedIn, Instagram issues no separate refresh token — the
 * long-lived access token refreshes itself. saveConnection() therefore
 * stores no refresh token for this platform, and that is correct rather
 * than missing.
 */
import "server-only";
import { config } from "@/lib/config";

const AUTHORIZATION_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE = "https://graph.instagram.com";

/**
 * Meta versions the Graph API and sunsets each version about two years out,
 * so this is a value to bump deliberately, not a floating "latest". Set to
 * the version current when Phase 12 was built and verified.
 */
export const API_VERSION = "v26.0";
export const GRAPH_BASE_URL = `${GRAPH_BASE}/${API_VERSION}`;

/**
 * Checked against the granted scopes at connection time, never at publish
 * time (Rules.md §3). `instagram_business_basic` identifies the account,
 * `instagram_business_content_publish` is the write scope.
 */
export const REQUIRED_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;

/**
 * Requested alongside the required ones but not required: it only unlocks
 * getAnalytics(). A founder who declines it can still publish, and
 * getAnalytics correctly reports nulls rather than failing (Rules.md §4 —
 * store null for anything unavailable, never guess).
 */
export const INSIGHTS_SCOPE = "instagram_business_manage_insights";

const REQUESTED_SCOPES = [...REQUIRED_SCOPES, INSIGHTS_SCOPE];

export interface InstagramAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface InstagramTokens {
  accessToken: string;
  /** Absolute ISO timestamp, derived from the response's `expires_in`. */
  expiresAt: string;
  scopes: string[];
  /** The Instagram professional account id — the `<IG_ID>` every publishing call is addressed to. */
  userId: string | null;
}

/** Null when the Instagram app isn't configured — the caller reports that, rather than half-starting a flow. */
export function instagramAppConfig(): InstagramAppConfig | null {
  const { clientId, clientSecret, redirectUri } = config.instagram;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export const NOT_CONFIGURED =
  "Instagram is not configured — set INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET and INSTAGRAM_REDIRECT_URI.";

export function authorizationUrl(app: InstagramAppConfig, state: string): string {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  // Documented as "a comma-separated or URL-encoded space-separated list".
  url.searchParams.set("scope", REQUESTED_SCOPES.join(","));
  return url.toString();
}

/** Meta's error envelope is `{ error: { message, type, code } }`; older endpoints use flat fields. */
async function describeTokenError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      error_message?: string;
      error_description?: string;
    };
    const message =
      (typeof parsed.error === "object" ? parsed.error?.message : parsed.error) ??
      parsed.error_message ??
      parsed.error_description;
    if (message) return `${message} (HTTP ${response.status})`;
  } catch {
    // not JSON — fall through
  }
  return body ? `HTTP ${response.status}: ${body.slice(0, 300)}` : `HTTP ${response.status}`;
}

interface ShortLivedResponse {
  access_token?: string;
  user_id?: string | number;
  permissions?: string | string[];
}

/**
 * Instagram appends `#_` to the authorization code on the browser redirect;
 * sending it back unstripped is rejected as an invalid code. Stripping it is
 * the documented handling, not a guess at a bug.
 */
function cleanCode(code: string): string {
  return code.replace(/#_$/, "");
}

/** Step 1 — the authorization code for a 1-hour token. Form-encoded, not JSON. */
async function exchangeForShortLived(app: InstagramAppConfig, code: string): Promise<ShortLivedResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "authorization_code",
      redirect_uri: app.redirectUri,
      code: cleanCode(code),
    }),
  });

  if (!response.ok) throw new Error(`Instagram token request failed: ${await describeTokenError(response)}`);

  // Business Login returns `{ data: [ { access_token, user_id, permissions } ] }`;
  // the older shape was those fields at the top level. Accept both rather
  // than break on whichever one this app's login flow is serving.
  const payload = (await response.json().catch(() => ({}))) as ShortLivedResponse & { data?: ShortLivedResponse[] };
  const token = payload.data?.[0] ?? payload;
  if (!token.access_token) throw new Error("Instagram's token response carried no access token.");
  return token;
}

function parseScopes(permissions: string | string[] | undefined): string[] {
  if (Array.isArray(permissions)) return permissions.filter(Boolean);
  if (typeof permissions === "string") return permissions.split(/[\s,]+/).filter(Boolean);
  return [];
}

interface LongLivedResponse {
  access_token?: string;
  expires_in?: number;
}

async function requestLongLived(url: URL): Promise<{ accessToken: string; expiresAt: string }> {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Instagram token exchange failed: ${await describeTokenError(response)}`);

  const payload = (await response.json().catch(() => ({}))) as LongLivedResponse;
  if (!payload.access_token) throw new Error("Instagram's long-lived token response carried no access token.");

  // Treat a missing expires_in as "expires now" rather than "never expires",
  // so an unexpected response shape can't produce a token we believe forever.
  return {
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + (payload.expires_in ?? 0) * 1000).toISOString(),
  };
}

/** Steps 1 + 2 together: the callback should only ever store a long-lived token. */
export async function exchangeCode(app: InstagramAppConfig, code: string): Promise<InstagramTokens> {
  const shortLived = await exchangeForShortLived(app, code);

  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", app.clientSecret);
  url.searchParams.set("access_token", shortLived.access_token!);

  const longLived = await requestLongLived(url);
  const granted = parseScopes(shortLived.permissions);

  return {
    ...longLived,
    // Instagram states the granted permissions in the exchange response; an
    // empty list would wrongly read as "nothing granted", so fall back to
    // what was requested and let validateConnection() exercise the token.
    scopes: granted.length > 0 ? granted : REQUESTED_SCOPES,
    userId: shortLived.user_id != null ? String(shortLived.user_id) : null,
  };
}

/** Step 3 — extend a long-lived token by another 60 days. Needs a token 24h+ old and not yet expired. */
export async function refreshTokens(accessToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  return requestLongLived(url);
}

/**
 * The Instagram professional account the token acts as. `user_id` — not
 * `id`, which is the app-scoped id — is the `<IG_ID>` the Content
 * Publishing endpoints are addressed to. Doubles as the liveness check in
 * validateConnection().
 */
export async function fetchAccount(accessToken: string): Promise<{ userId: string; username: string | null }> {
  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Instagram rejected the access token (${await describeTokenError(response)})`);

  const payload = (await response.json().catch(() => ({}))) as { user_id?: string | number; username?: string };
  if (payload.user_id == null) throw new Error("Instagram's /me response carried no account id (`user_id`).");

  return { userId: String(payload.user_id), username: payload.username ?? null };
}
