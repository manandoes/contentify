/**
 * Step 1 of Instagram Business Login: send the founder to Instagram's
 * consent screen. Everything not Instagram-specific is shared — see
 * connectors/oauthFlow.ts.
 */
import "server-only";
import { instagramOAuthFlow } from "@/connectors/instagram";
import { oauthStartRoute } from "@/connectors/oauthFlow";

export const GET = oauthStartRoute(instagramOAuthFlow);
