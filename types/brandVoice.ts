/**
 * Shape of `brands.voice_profile` (Implementationplan.md Phase 4): tone,
 * words to use/avoid, hashtag rules, emoji rules, CTA style. Every field
 * has a zod `.default()` so parsing the seeded `{}` — or any older partial
 * profile — always yields a complete, safe-to-use object instead of
 * throwing. This is the contract services/brandVoice.ts enforces on both
 * read and write.
 */
import { z } from "zod";

export const voiceProfileSchema = z.object({
  tone: z.string().default(""),
  words_to_use: z.array(z.string()).default([]),
  words_to_avoid: z.array(z.string()).default([]),
  hashtag_rules: z
    .object({
      max_count: z.number().int().min(0).default(3),
      always_include: z.array(z.string()).default([]),
      placement: z.enum(["end", "first_comment"]).default("end"),
    })
    .default({ max_count: 3, always_include: [], placement: "end" }),
  emoji_rules: z
    .object({
      allowed: z.boolean().default(false),
      max_count: z.number().int().min(0).default(0),
    })
    .default({ allowed: false, max_count: 0 }),
  cta_style: z.string().default(""),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const DEFAULT_VOICE_PROFILE: VoiceProfile = voiceProfileSchema.parse({});
