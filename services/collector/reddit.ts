/**
 * Reddit, via OAuth app-only ("client_credentials") access. Verified directly
 * that Reddit's unauthenticated public .json endpoints return 403 even with a
 * descriptive User-Agent — client_credentials is the actual requirement, not
 * a defensive assumption.
 *
 * Optional: without REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET this adapter
 * returns an empty array rather than attempting a call that would fail, so
 * the collect route never reports a fake "0 results" success for a source
 * that was never configured. See .env.example.
 */
import "server-only";
import { config } from "@/lib/config";
import type { RawSignal } from "@/types/collector";

const SUBREDDITS = ["SaaS", "startups", "marketing"];
const USER_AGENT = "contentify-collector/0.1 (internal content-idea tool)";

interface RedditTokenResponse {
  access_token: string;
  expires_in: number;
}

interface RedditPostData {
  id: string;
  title: string;
  url: string;
  permalink: string;
  selftext: string | null;
  score: number | null;
}

interface RedditListingResponse {
  data: { children: { data: RedditPostData }[] };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit OAuth token request failed: ${res.status}`);

  const body = (await res.json()) as RedditTokenResponse;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return body.access_token;
}

async function fetchSubreddit(subreddit: string, token: string): Promise<RawSignal[]> {
  const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=25`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Reddit r/${subreddit} request failed: ${res.status}`);

  const body = (await res.json()) as RedditListingResponse;

  return body.data.children.map(({ data }) => ({
    source: `reddit:r/${subreddit}`,
    sourceKind: "general",
    title: data.title,
    url: `https://www.reddit.com${data.permalink}`,
    rawContent: data.selftext,
    engagementScore: data.score,
  }));
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const clientId = config.reddit.clientId;
  const clientSecret = config.reddit.clientSecret;
  if (!clientId || !clientSecret) return [];

  const token = await getAccessToken(clientId, clientSecret);
  const results = await Promise.all(SUBREDDITS.map((sub) => fetchSubreddit(sub, token)));
  return results.flat();
}
