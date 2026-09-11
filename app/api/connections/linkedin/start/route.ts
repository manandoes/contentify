/**
 * Step 1 of LinkedIn's 3-legged OAuth: send the founder to LinkedIn's
 * consent screen. Opened from the Connect button on /settings, so this is a
 * browser navigation, not an API call.
 *
 * The `state` value is random per attempt and mirrored into an httpOnly
 * cookie the callback checks — LinkedIn's docs are explicit that a callback
 * whose state doesn't match its request must be rejected, which is what
 * stops someone else's authorization code being planted on this account.
 *
 * Note: like every other screen in this app, this route has no user
 * authentication in front of it — Supabase Auth against
 * ALLOWED_FOUNDER_EMAIL is still unbuilt. On a deployed instance that gap
 * covers the whole dashboard, not just this route, and closing it is its
 * own piece of work.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizationUrl, linkedInAppConfig } from "@/connectors/linkedin/oauth";

export const OAUTH_STATE_COOKIE = "linkedin_oauth_state";

export async function GET(): Promise<NextResponse> {
  const app = linkedInAppConfig();
  if (!app) {
    return NextResponse.json(
      { error: "LinkedIn is not configured — set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and LINKEDIN_REDIRECT_URI." },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(authorizationUrl(app, state));

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive LinkedIn's top-level redirect back
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // LinkedIn's authorization code lives 30 minutes; the consent step is much shorter
  });

  return response;
}
