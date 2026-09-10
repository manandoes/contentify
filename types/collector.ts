/**
 * The shape every collector adapter (services/collector/*) produces, before
 * app/api/ideas/collect/route.ts maps it onto raw_signals' Insert type and
 * dedupes on url. Kept separate from types/database.ts so an adapter never
 * needs to import generated DB types.
 */
export interface RawSignal {
  source: string;
  sourceKind: "general" | "competitor";
  competitorId?: string | null;
  keywordMatched?: string | null;
  title: string;
  url: string;
  rawContent?: string | null;
  engagementScore?: number | null;
}
