/**
 * Hacker News, via the Algolia HN Search API — public, no key, no rate-limit
 * problems in practice. Returns the newest stories; the route handler dedupes
 * on url so polling the same window repeatedly is harmless.
 */
import "server-only";
import type { RawSignal } from "@/types/collector";

const ALGOLIA_URL = "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=50";

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  story_text: string | null;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const res = await fetch(ALGOLIA_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Hacker News (Algolia) request failed: ${res.status}`);

  const body = (await res.json()) as AlgoliaResponse;

  return body.hits
    .filter((hit): hit is AlgoliaHit & { title: string } => Boolean(hit.title))
    .map((hit) => ({
      source: "hackernews",
      sourceKind: "general",
      title: hit.title,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      rawContent: hit.story_text,
      engagementScore: hit.points,
    }));
}
