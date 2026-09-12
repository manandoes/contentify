/**
 * The browser half of OAuth, once, for every platform.
 *
 * Phase 11 wrote LinkedIn's start and callback routes by hand. Phase 12 adds
 * a second platform, and the part that would have been copy-pasted is the
 * part that must never drift: the random `state`, the httpOnly cookie it is
 * mirrored into, and the callback's refusal to proceed when the two don't
 * match. That check is what stops someone else's authorization code being
 * planted on this account, so it gets one implementation, not one per
 * platform (Architecture.md §6's "adding a platform later is one new
 * folder", applied to the routes too).
 *
 * What stays per-platform is only what is genuinely per-platform: the
 * consent URL and the code exchange, both supplied by the connector.
 *
 * Note: like every other screen in this app, these routes have no user
 * authentication in front of them — Supabase Auth against
 * ALLOWED_FOUNDER_EMAIL is still unbuilt. On a deployed instance that gap
 * covers the whole dashboard, not just these routes, and closing it is its
 * own piece of work.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Platform } from "@/types/enums";

export interface OAuthFlow {
  platform: Platform;
  /** How the platform spells its own name, for messages the founder reads ("LinkedIn", not "Linkedin"). */
  label: string;
  /** Null when the platform's app credentials aren't configured — reported, never half-started. */
  authorizationUrl(state: string): string | null;
  /** Shown when authorizationUrl() returns null. Names the exact env vars to set. */
  notConfigured: string;
  /** Exchanges the code, verifies scopes, stores the encrypted tokens. Throws with a readable message. */
  complete(code: string): Promise<void>;
}

function stateCookie(platform: Platform): string {
  return `${platform}_oauth_state`;
}

/**
 * Step 1: send the founder to the platform's consent screen. Opened from the
 * Connect button on /settings, so this is a browser navigation, not an API
 * call.
 */
export function oauthStartRoute(flow: OAuthFlow): () => Promise<NextResponse> {
  return async function GET(): Promise<NextResponse> {
    const state = randomBytes(16).toString("hex");
    const url = flow.authorizationUrl(state);
    if (!url) return NextResponse.json({ error: flow.notConfigured }, { status: 400 });

    const response = NextResponse.redirect(url);
    response.cookies.set(stateCookie(flow.platform), state, {
      httpOnly: true,
      sameSite: "lax", // must survive the platform's top-level redirect back
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600, // authorization codes live far longer; the consent step itself is short
    });
    return response;
  };
}

function backToSettings(request: Request, platform: Platform, params: Record<string, string>): NextResponse {
  const url = new URL("/settings", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = NextResponse.redirect(url);
  response.cookies.delete(stateCookie(platform));
  return response;
}

/**
 * Step 2: the platform redirects the founder back with either a code or an
 * error. Every path ends in a redirect to /settings carrying a readable
 * message, because the founder is sitting in a browser, not reading JSON.
 */
export function oauthCallbackRoute(flow: OAuthFlow): (request: Request) => Promise<NextResponse> {
  return async function GET(request: Request): Promise<NextResponse> {
    const url = new URL(request.url);
    const { label } = flow;

    const error = url.searchParams.get("error");
    if (error) {
      return backToSettings(request, flow.platform, {
        connectionError: url.searchParams.get("error_description") ?? `${label} returned "${error}".`,
      });
    }

    const state = url.searchParams.get("state");
    const expectedState = request.headers
      .get("cookie")
      ?.split("; ")
      .find((entry) => entry.startsWith(`${stateCookie(flow.platform)}=`))
      ?.slice(stateCookie(flow.platform).length + 1);

    if (!state || !expectedState || state !== expectedState) {
      return backToSettings(request, flow.platform, {
        connectionError: `That ${label} sign-in didn't match this browser session. Try connecting again.`,
      });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return backToSettings(request, flow.platform, { connectionError: `${label} didn't return an authorization code.` });
    }

    try {
      await flow.complete(code);
    } catch (exchangeError) {
      return backToSettings(request, flow.platform, { connectionError: (exchangeError as Error).message });
    }

    return backToSettings(request, flow.platform, { connected: flow.platform });
  };
}
