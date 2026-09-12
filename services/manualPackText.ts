/**
 * The manual export pack's shape and its plain-text rendering.
 *
 * Split from services/manualPack.ts for the same reason as
 * services/approvalWorkflow.ts and connectors/linkedin/commentary.ts: this
 * half is pure and dependency-free, so it can be unit-tested directly, while
 * the database reads that fill it stay next door.
 *
 * The two rules it must not break, both pinned in tests/manualPack.test.ts:
 * the caption is rendered by the same assembly a connector would use, and
 * `first_comment` never appears inside it.
 */
import type { AspectRatio, Platform } from "../types/enums.ts";

export interface ManualPackAsset {
  aspectRatio: AspectRatio;
  /** Short-lived signed download URL — the bucket itself stays private. */
  url: string;
  /** True for the crop this platform's feed expects (types/platformRules.ts). */
  recommended: boolean;
}

export interface ManualPack {
  versionId: string;
  platform: Platform;
  status: string;
  /** The post body exactly as it should be pasted: hook, body, CTA, hashtags. */
  caption: string;
  /** Posted as a separate comment after the post is up, never appended to the caption. */
  firstComment: string | null;
  assets: ManualPackAsset[];
  warnings: string[];
  generatedAt: string;
}

/** The pack as a plain-text file — one thing to open, copy from, and keep. */
export function renderManualPack(pack: ManualPack): string {
  const platform = pack.platform.charAt(0).toUpperCase() + pack.platform.slice(1);
  const rule = "=".repeat(60);

  const lines = [
    `${platform} — ready to post by hand`,
    `Version ${pack.versionId} · status ${pack.status} · exported ${pack.generatedAt}`,
    "",
    rule,
    "CAPTION — paste this as the post",
    rule,
    "",
    pack.caption,
    "",
  ];

  if (pack.firstComment) {
    lines.push(rule, "FIRST COMMENT — post this separately, once the post is up", rule, "", pack.firstComment, "");
  }

  lines.push(rule, "MEDIA", rule, "");
  if (pack.assets.length === 0) {
    lines.push("No formatted media for this post.", "");
  } else {
    lines.push("Download links expire in one hour. Re-export for fresh ones.", "");
    for (const asset of pack.assets) {
      lines.push(`${asset.aspectRatio}${asset.recommended ? `  <- use this one for ${platform}` : ""}`, asset.url, "");
    }
  }

  if (pack.warnings.length > 0) {
    lines.push(rule, "WARNINGS FROM THE CAPTION AGENT", rule, "");
    for (const warning of pack.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  return lines.join("\n");
}
