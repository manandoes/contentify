/**
 * Hand-authored, spec-driven enums (Architecture.md §5 / Phases.md Phase 1).
 * Deliberately NOT sourced from types/database.ts — that file is
 * regenerated wholesale from the live schema in Phase 1 and again on every
 * future migration, and code outside the DB layer (connectors, agent
 * schemas, platform-rule tables) shouldn't have to churn every time that
 * regeneration runs. The Postgres enum types created in the Phase 1
 * migration must stay byte-for-byte in sync with the arrays below.
 */

export const PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
  "threads",
  "facebook",
  "pinterest",
  "email",
  "blog",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "READY_TO_POST",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const COMPETITOR_RECENCY_VALUES = ["clear", "trending", "recently_covered"] as const;
export type CompetitorRecency = (typeof COMPETITOR_RECENCY_VALUES)[number];

// Phase 8 format engine (services/media.ts). Matches the comment on
// content_assets.aspect_ratio in the Phase 1 migration exactly — that
// column is plain `text`, not a Postgres enum, so this array is the only
// place the set is enforced.
export const ASPECT_RATIOS = ["4:5", "1:1", "9:16", "16:9", "2:3"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
