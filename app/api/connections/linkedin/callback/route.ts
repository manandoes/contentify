/**
 * Step 2 of LinkedIn's 3-legged OAuth: LinkedIn redirects the founder back
 * here with either a code or an error. This route is a thin shell — the
 * token exchange, scope check and encrypted storage are in
 * connectors/linkedin, so everything LinkedIn-shaped stays in one folder.
 *
 * Every path ends in a redirect back to /settings carrying a readable
 * message, because the founder is sitting in a browser, not reading a JSON
 * response.
 *
 * LINKEDIN_REDIRECT_URI must point at this route and match the value
 * registered in the LinkedIn developer portal byte-for-byte.
 */
import "server-only";
import { NextResponse } from "next/server";
import { completeLinkedInConnection } from "@/connectors/linkedin";
import { OAUTH_STATE_COOKIE } from "../start/route";

function backToSettings(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/settings", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return backToSettings(request, {
      connectionError: url.searchParams.get("error_description") ?? `LinkedIn returned "${error}".`,
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((entry) => entry.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);

  // Rejecting a mismatched state is what LinkedIn's own docs require: it is
  // the difference between "the founder just authorized this" and "someone
  // else's authorization code arrived here".
  if (!state || !expectedState || state !== expectedState) {
    return backToSettings(request, { connectionError: "That LinkedIn sign-in didn't match this browser session. Try connecting again." });
  }
  if (!code) {
    return backToSettings(request, { connectionError: "LinkedIn didn't return an authorization code." });
  }

  try {
    await completeLinkedInConnection(code);
  } catch (exchangeError) {
    return backToSettings(request, { connectionError: (exchangeError as Error).message });
  }

  return backToSettings(request, { connected: "linkedin" });
}
