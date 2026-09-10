/**
 * Request-body contract for /api/content/ingest (Phase 5). Accepts either
 * the idea-finalizer's ingestion object (Architecture.md §2: "one
 * ingestion-ready JSON object", validated upstream against
 * ideaFinalizerOutputSchema) or a manually pasted post — so fields the
 * finalizer always fills with a placeholder (original_platform: "") are
 * optional/nullable here rather than literal.
 */
import { z } from "zod";
import { PLATFORMS } from "./enums";

const emptyStringToNull = (value: unknown) => (value === "" ? null : value);

export const contentIngestSchema = z.object({
  title: z.string().min(1),
  // Rules.md §4 Content Analyzer error behavior only makes sense against a
  // non-empty source — an idea-finalizer output with content: "" means it
  // returned needs_clarification instead of a finished seed post.
  content: z.string().min(1, "content must not be empty (check the finalizer's needs_clarification field)"),
  content_type: z.string().default("text"),
  media: z.array(z.unknown()).default([]),
  original_platform: z.preprocess(emptyStringToNull, z.enum(PLATFORMS).nullable()).default(null),
  goal: z.preprocess(emptyStringToNull, z.string().nullable()).default(null),
  audience: z.preprocess(emptyStringToNull, z.string().nullable()).default(null),
  cta: z.preprocess(emptyStringToNull, z.string().nullable()).default(null),
  source_brief_id: z.uuid().nullable().optional(),
});
export type ContentIngestInput = z.infer<typeof contentIngestSchema>;
