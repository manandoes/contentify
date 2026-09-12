/**
 * Step 2 of LinkedIn's OAuth: LinkedIn redirects the founder back here. The
 * token exchange, scope check and encrypted storage live in
 * connectors/linkedin; the state check and redirect-to-/settings handling
 * are shared in connectors/oauthFlow.ts.
 *
 * LINKEDIN_REDIRECT_URI must point at this route and match the value
 * registered in the LinkedIn developer portal byte-for-byte.
 */
import "server-only";
import { linkedInOAuthFlow } from "@/connectors/linkedin";
import { oauthCallbackRoute } from "@/connectors/oauthFlow";

export const GET = oauthCallbackRoute(linkedInOAuthFlow);
