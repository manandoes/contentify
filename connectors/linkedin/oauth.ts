/**
 * LinkedIn 3-legged OAuth, verified against
 * learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow
 * (fetched during this build — not recalled).
 *
 * Two self-serve products cover everything Phase 11 needs:
 *  - "Sign In with LinkedIn using OpenID Connect" → `openid`, `profile`,
 *    which is how we learn *which member* the token acts as (`sub`).
 *  - "Share on LinkedIn" → `w_member_social`, the write scope.
 *
 * Programmatic refresh tokens are partner-gated: LinkedIn only returns a
 * `refresh_token` to approved apps, and the documented path for everyone else
 * is to send the member through authorization again (which is silent while
 * they're still signed in). So `refreshTokens` exists and is used when a
 * refresh token was actually issued, and the connector falls back to marking
 * the connection broken — prompting re-auth — when it wasn't. That is
 * Rules.md §3's "auto-refresh; if refresh fails, mark the connection broken
 * and prompt re-auth" with the platform's real constraint in view.
 */
import "server-only";
import { config } from "@/lib/config";

const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

/** Checked against the granted scopes at connection time, never at publish time (Rules.md §3). */
export const REQUIRED_SCOPES = ["openid", "profile", "w_member_social"] as const;

export interface LinkedInAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface LinkedInTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute ISO timestamp, derived from the response's `expires_in`. */
  expiresAt: string;
  scopes: string[];
}

/** Null when the LinkedIn app isn't configured — the caller reports that, rather than half-starting a flow. */
export function linkedInAppConfig(): LinkedInAppConfig | null {
  const { clientId, clientSecret, redirectUri } = config.linkedin;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function authorizationUrl(app: LinkedInAppConfig, state: string): string {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function requestTokens(app: LinkedInAppConfig, body: Record<string, string>): Promise<LinkedInTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...body }),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    throw new Error(`LinkedIn token request failed: ${detail}`);
  }

  // LinkedIn currently issues 60-day access tokens; treat a missing
  // expires_in as "expires now" rather than "never expires", so an
  // unexpected response shape can't produce a token we believe forever.
  const expiresInSeconds = payload.expires_in ?? 0;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    scopes: payload.scope ? payload.scope.split(/[\s,]+/).filter(Boolean) : [...REQUIRED_SCOPES],
  };
}

export function exchangeCode(app: LinkedInAppConfig, code: string): Promise<LinkedInTokens> {
  return requestTokens(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri });
}

export function refreshTokens(app: LinkedInAppConfig, refreshToken: string): Promise<LinkedInTokens> {
  return requestTokens(app, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * The member URN the token acts as. `sub` from the OpenID Connect userinfo
 * endpoint is the member id; the Posts API wants it as a person URN.
 * Doubles as the liveness check in validateConnection().
 */
export async function fetchMemberUrn(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`LinkedIn rejected the access token (HTTP ${response.status} from /v2/userinfo)`);
  }

  const payload = (await response.json().catch(() => ({}))) as { sub?: string };
  if (!payload.sub) {
    throw new Error("LinkedIn's /v2/userinfo response carried no member id (`sub`)");
  }
  return `urn:li:person:${payload.sub}`;
}
