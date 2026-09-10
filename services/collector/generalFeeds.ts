/**
 * General-topic RSS/Atom feeds polled by services/collector/rss.ts. Founder-
 * editable, same spirit as agents/*.md — add or remove feeds here without
 * touching route/adapter code. Every URL below was verified to resolve to a
 * real feed (not a redirect to an HTML page) before being added; do the same
 * before adding more.
 */
export interface GeneralFeed {
  name: string;
  url: string;
}

export const GENERAL_FEEDS: GeneralFeed[] = [
  { name: "TechCrunch: Startups", url: "https://techcrunch.com/category/startups/feed/" },
  { name: "Product Hunt", url: "https://www.producthunt.com/feed" },
];
