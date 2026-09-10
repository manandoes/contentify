/**
 * Platform Adapter's "PLATFORM RULES" input (Rules.md §4 Master Adaptation
 * Agent). Hand-authored config, same pattern as types/enums.ts and
 * types/brandVoice.ts — not sourced from the DB. Phase 6 scope only
 * (Phases.md: "start with 2, not 10"); extending to more platforms is
 * Phase 12 and means adding a key here *and* to platformAdapterOutputSchema
 * in types/agents.ts together.
 */

export type AdapterPlatform = "instagram" | "linkedin";

export interface PlatformRule {
  platform: AdapterPlatform;
  maxLength: number;
  structureGuidance: string;
  toneGuidance: string;
}

export const PLATFORM_RULES: Record<AdapterPlatform, PlatformRule> = {
  instagram: {
    platform: "instagram",
    maxLength: 2200,
    structureGuidance:
      "Short punchy hook line, then a few line breaks between short paragraphs or a scannable list. Visual-first — write as if a photo/carousel/reel already carries the context.",
    toneGuidance: "Casual, direct, conversational. Second person. Fine to use sentence fragments.",
  },
  linkedin: {
    platform: "linkedin",
    maxLength: 3000,
    structureGuidance:
      "Hook line that stands alone before the 'see more' fold, then a short line-broken narrative or numbered takeaways. No hashtag-stuffed feel.",
    toneGuidance: "Professional but human — a practitioner sharing a real lesson, not a press release. No slang, no forced enthusiasm.",
  },
};
