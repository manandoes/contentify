/**
 * Zod schemas for the idea-engine agents' structured output, matching
 * Rules.md §4's OUTPUT FORMAT for each agent exactly. Passed straight to
 * lib/gemini.ts's runAgent(), which converts them to a JSON Schema for
 * Gemini's responseJsonSchema and re-validates the response against the
 * same schema — this file is the actual contract, not the prompt text.
 */
import { z } from "zod";
import { COMPETITOR_RECENCY_VALUES } from "./enums";

const evidenceItemSchema = z.object({
  source: z.string(),
  url: z.string(),
  excerpt: z.string(),
});

export const researcherOutputSchema = z.object({
  openings: z
    .array(
      z.object({
        opening: z.string(),
        angle_type: z.string(),
        evidence: z.array(evidenceItemSchema),
        competitor_recency: z.enum(COMPETITOR_RECENCY_VALUES),
        competitor_note: z.string().nullable().optional(),
        score: z.object({
          novelty: z.number(),
          relevance: z.number(),
          proof_of_demand: z.number(),
          effort: z.number(),
        }),
        rank: z.number(),
      }),
    )
    .max(3),
});
export type ResearcherOutput = z.infer<typeof researcherOutputSchema>;

export const hookWriterOutputSchema = z.object({
  brief_id: z.string(),
  survivors: z
    .array(
      z.object({
        hook_text: z.string(),
        rationale: z.string(),
      }),
    )
    .max(3),
});
export type HookWriterOutput = z.infer<typeof hookWriterOutputSchema>;

export const ideaFinalizerOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  content_type: z.literal("text"),
  media: z.array(z.never()),
  original_platform: z.literal(""),
  goal: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  cta: z.string().nullable().optional(),
  // The agent is never given real voice_profile data (Phase 4/5 owns that) —
  // whatever it returns here is illustrative only, never authoritative.
  brand_voice: z.unknown().nullable().optional(),
  needs_clarification: z.string().optional(),
});
export type IdeaFinalizerOutput = z.infer<typeof ideaFinalizerOutputSchema>;

export const contentAnalyzerOutputSchema = z.object({
  core_idea: z.string(),
  hook: z.string(),
  key_points: z.array(z.string()),
  facts_to_preserve: z.array(z.string()),
  visual_requirements: z.string(),
  needs_clarification: z.array(z.string()).default([]),
});
export type ContentAnalyzerOutput = z.infer<typeof contentAnalyzerOutputSchema>;
