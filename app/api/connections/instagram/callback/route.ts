/**
 * Step 2 of Instagram Business Login: Instagram redirects the founder back
 * here. The three-step token exchange, scope check and encrypted storage
 * live in connectors/instagram.
 *
 * INSTAGRAM_REDIRECT_URI must point at this route, match the value
 * registered in the Meta app dashboard byte-for-byte, and be HTTPS —
 * Instagram rejects plain HTTP redirect URIs.
 */
import "server-only";
import { instagramOAuthFlow } from "@/connectors/instagram";
import { oauthCallbackRoute } from "@/connectors/oauthFlow";

export const GET = oauthCallbackRoute(instagramOAuthFlow);
