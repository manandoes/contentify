/**
 * Turns a Caption Agent caption into LinkedIn's `little` text format — the
 * shape the Posts API's `commentary` field is parsed as.
 *
 * Kept pure and dependency-free (no server-only, no fetch) for the same
 * reason as services/approvalWorkflow.ts: the escaping rule is exact,
 * easy to get subtly wrong, and worth unit-testing on its own.
 *
 * What is LinkedIn-specific is only the escaping and the hashtag syntax
 * below; the hook/body/CTA/hashtags assembly order is shared with every
 * other platform and lives in connectors/captionText.ts.
 *
 * Two rules from LinkedIn's little Text Format reference, verified during
 * this build:
 *  1. Every reserved character must be escaped with a backslash, "even if
 *     those characters are not used in one of the supported elements". Miss
 *     one and the post either fails to parse or renders mangled text — the
 *     founder's caption would not go out as written.
 *  2. A real, clickable hashtag is the HashtagTemplate `{hashtag|\#|value}`,
 *     not a bare `#value` — which, once escaped per rule 1, is inert text.
 *     The brand's hashtag rules (Phase 4) exist to produce working hashtags,
 *     so they go through the template.
 */

import { assembleCaption, type CaptionBlocks } from "../captionText.ts";

/** `\ | { } @ [ ] ( ) < > # * _ ~` — backslash first so escapes aren't re-escaped. */
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

export function escapeLittleText(text: string): string {
  return text.replace(RESERVED, (char) => `\\${char}`);
}

/** `#buildinpublic` / `buildinpublic` → `{hashtag|\#|buildinpublic}`. Empty after cleanup → dropped. */
export function hashtagTemplate(tag: string): string | null {
  const value = tag.trim().replace(/^[#＃]+/, "");
  if (!value) return null;
  return `{hashtag|\\#|${escapeLittleText(value)}}`;
}

export type CommentaryCaption = CaptionBlocks;

/**
 * Blocks are joined with a blank line: LinkedIn collapses nothing, so this is
 * exactly the hook-above-the-fold / body / CTA / hashtags shape the Caption
 * Agent wrote (agents/captionAgent.md). `first_comment` is deliberately not
 * included — it is a separate comment on the published post, not part of it.
 */
export function buildCommentary(caption: CommentaryCaption): string {
  return assembleCaption(caption, { escape: escapeLittleText, hashtag: hashtagTemplate });
}
