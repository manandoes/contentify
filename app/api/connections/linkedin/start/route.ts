/**
 * Step 1 of LinkedIn's OAuth: send the founder to LinkedIn's consent screen.
 * The state cookie, the CSRF check behind it and the redirect handling are
 * shared across every platform — see connectors/oauthFlow.ts.
 */
import "server-only";
import { linkedInOAuthFlow } from "@/connectors/linkedin";
import { oauthStartRoute } from "@/connectors/oauthFlow";

export const GET = oauthStartRoute(linkedInOAuthFlow);
