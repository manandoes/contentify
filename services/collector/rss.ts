/**
 * Generic RSS/Atom adapter, used two ways by app/api/ideas/collect/route.ts:
 *  - fetchSignals() polls the founder-editable GENERAL_FEEDS list
 *    (source_kind='general')
 *  - fetchCompetitorSignal() polls one tracked_competitors.feed_url
 *    (source_kind='competitor') — the legally-pollable resolution to the
 *    competitor-recency-vs-no-scraping tension (see the plan / Rules.md §1.7)
 */
import "server-only";
import Parser from "rss-parser";
import type { RawSignal } from "@/types/collector";
import { GENERAL_FEEDS } from "./generalFeeds";

const parser = new Parser({ timeout: 15_000 });

async function parseOneFeed(feedUrl: string): Promise<Parser.Item[]> {
  const feed = await parser.parseURL(feedUrl);
  return feed.items;
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.all(
    GENERAL_FEEDS.map(async (feed) => {
      const items = await parseOneFeed(feed.url);
      return items
        .filter((item): item is Parser.Item & { title: string; link: string } => Boolean(item.title && item.link))
        .map((item) => ({
          source: `rss:${feed.name}`,
          sourceKind: "general" as const,
          title: item.title,
          url: item.link,
          rawContent: item.contentSnippet ?? item.content ?? null,
          engagementScore: null,
        }));
    }),
  );
  return results.flat();
}

export async function fetchCompetitorSignals(competitor: {
  id: string;
  name: string;
  feedUrl: string;
}): Promise<RawSignal[]> {
  const items = await parseOneFeed(competitor.feedUrl);
  return items
    .filter((item): item is Parser.Item & { title: string; link: string } => Boolean(item.title && item.link))
    .map((item) => ({
      source: `competitor:${competitor.name}`,
      sourceKind: "competitor" as const,
      competitorId: competitor.id,
      title: item.title,
      url: item.link,
      rawContent: item.contentSnippet ?? item.content ?? null,
      engagementScore: null,
    }));
}
