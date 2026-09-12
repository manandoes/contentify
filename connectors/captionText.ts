/**
 * The one rule for turning a Caption Agent caption into a single block of
 * post text: hook, body, CTA, hashtags, one blank line between each, empty
 * blocks dropped (agents/captionAgent.md).
 *
 * Extracted in Phase 12 because three callers now need it — LinkedIn's
 * little-text `commentary`, Instagram's plain-text `caption`, and the manual
 * export pack — and they must not drift apart. What differs per caller is
 * only *how a character or a hashtag is rendered*, which is the `escape` /
 * `hashtag` hooks; the assembly order is the same everywhere and lives here.
 *
 * Pure and dependency-free (no server-only, no fetch) for the same reason as
 * services/approvalWorkflow.ts: it is exact, easy to get subtly wrong, and
 * worth unit-testing on its own.
 */

export interface CaptionBlocks {
  hook: string;
  body: string;
  cta: string | null;
  hashtags: string[];
}

export interface CaptionTextOptions {
  /** Per-platform character escaping. Defaults to identity — plain text. */
  escape?: (text: string) => string;
  /** Renders one hashtag, or null to drop it. Defaults to a plain `#tag`. */
  hashtag?: (tag: string) => string | null;
}

/** `#buildinpublic` / `buildinpublic` → `#buildinpublic`. Empty after cleanup → dropped. */
export function plainHashtag(tag: string): string | null {
  const value = tag.trim().replace(/^[#＃]+/, "");
  return value ? `#${value}` : null;
}

/**
 * `first_comment` is deliberately never part of this: it is a separate
 * comment on the published post, not part of the post body. Every caller
 * carries it separately or not at all — none of them may quietly append it.
 */
export function assembleCaption(caption: CaptionBlocks, options: CaptionTextOptions = {}): string {
  const escape = options.escape ?? ((text: string) => text);
  const hashtag = options.hashtag ?? plainHashtag;

  const hashtags = caption.hashtags.map(hashtag).filter((tag): tag is string => tag !== null);

  return [escape(caption.hook), escape(caption.body), caption.cta ? escape(caption.cta) : "", hashtags.join(" ")]
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}
