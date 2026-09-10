/**
 * Phase 8 (Phases.md, Implementationplan.md Block D). The Format Engine
 * from Architecture.md §1/§2: "media + target aspect ratio → resized/cropped
 * assets. Never stretches media." Reads a raw image buffer, writes back one
 * JPEG buffer per target aspect ratio — the API route (app/api/content/format)
 * owns uploading those buffers to Supabase Storage and writing content_assets.
 *
 * "Never stretch": every output uses sharp's `fit: "cover"`, which always
 * uniformly scales-then-crops to fill the exact target pixels — it can
 * physically never distort the source's aspect ratio the way `fit: "fill"`
 * would.
 *
 * "Attention-preserving crop": `position: sharp.strategy.attention` is
 * libvips' own saliency-based crop (edge + skin-tone detection) — reused
 * as-is rather than reimplemented (this dependency already owns the
 * concern).
 *
 * "Safe-zone checks": a check-and-flag, not a check-and-fix, matching this
 * codebase's existing warnings[] convention (lib/factsPreserved.ts's
 * findMissingFacts, surfaced in app/api/content/generate/route.ts). Some
 * platforms reserve fixed bands of a frame for UI chrome that can cover the
 * subject (Stories/Reels/TikTok's top profile bar and bottom caption/action
 * buttons on 9:16, chiefly). For each ratio's reserved margin band(s), this
 * compares how visually "busy" (grayscale stdev, a standard entropy proxy)
 * that band is against the safe interior. A margin busier than the interior
 * means the attention-crop likely put something interesting under platform
 * UI — flagged via safeZoneWarning, not silently shipped.
 *
 * No "server-only" guard here, unlike most of services/ — unlike lib/db.ts
 * this module touches no secrets or env vars, it's a pure buffer-in/buffer-
 * out function, so it's kept plain like lib/factsPreserved.ts to stay
 * unit-testable under `node --test` (tests/media.test.ts). Its only caller,
 * app/api/content/format/route.ts, is already server-only by construction
 * (a Route Handler).
 */
import sharp, { type Metadata } from "sharp";
import { ASPECT_RATIOS, type AspectRatio } from "../types/enums.ts";

export interface FormattedAsset {
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  buffer: Buffer;
  safeZoneWarning: boolean;
}

// Standard social export sizes. Fixed on purpose (Phases.md doesn't ask for
// configurable output sizes) — one pixel target per ratio, not a setting.
const TARGET_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "2:3": { width: 1080, height: 1620 },
};

interface SafeZoneMargin {
  axis: "vertical" | "horizontal";
  start: number;
  end: number;
}

// Only 9:16 models a real platform UI overlay (Stories/Reels/TikTok reserve
// a top profile/close-button band and a bottom caption/action-button band).
// The rest get small cosmetic margins so the same check path runs
// uniformly without tripping on ordinary framing.
const SAFE_ZONE_MARGINS: Record<AspectRatio, SafeZoneMargin> = {
  "9:16": { axis: "vertical", start: 0.12, end: 0.2 },
  "4:5": { axis: "vertical", start: 0.04, end: 0.04 },
  "1:1": { axis: "vertical", start: 0.04, end: 0.04 },
  "16:9": { axis: "horizontal", start: 0.04, end: 0.04 },
  "2:3": { axis: "vertical", start: 0.06, end: 0.06 },
};

const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Grayscale stdev (visual "interest" proxy) of one region of an image.
 *
 * `.extract()` must be materialized with its own `.toBuffer()` before
 * `.stats()` runs on it — chaining `sharp(x).extract(region).greyscale().stats()`
 * in one pipeline silently computes stats over the *whole* source image,
 * ignoring the extract (verified directly against sharp 0.34/vips 8.17;
 * not a documented limitation, just an observed pipeline-ordering quirk).
 */
async function regionStdev(source: Buffer, region: Region): Promise<number> {
  const extracted = await sharp(source).extract(region).toBuffer();
  const { channels } = await sharp(extracted).greyscale().stats();
  return channels[0].stdev;
}

/**
 * Rules.md §3 "Invalid media" row: validate before processing, clear and
 * specific error — not a generic crash mid-resize.
 */
async function assertSupportedImage(input: Buffer): Promise<Metadata> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch (error) {
    throw new Error(`Not a readable image file: ${(error as Error).message}`);
  }
  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
    throw new Error(`Unsupported image format "${metadata.format ?? "unknown"}" — expected JPEG, PNG, or WebP`);
  }
  if (!metadata.width || !metadata.height) {
    throw new Error("Image is missing width/height metadata");
  }
  return metadata;
}

async function checkSafeZone(cropped: Buffer, width: number, height: number, margin: SafeZoneMargin): Promise<boolean> {
  const isVertical = margin.axis === "vertical";
  const startSize = Math.round((isVertical ? height : width) * margin.start);
  const endSize = Math.round((isVertical ? height : width) * margin.end);
  const interiorSize = (isVertical ? height : width) - startSize - endSize;

  if (startSize <= 0 || endSize <= 0 || interiorSize <= 0) return false;

  const extractRegion = (offset: number, size: number) =>
    isVertical
      ? { left: 0, top: offset, width, height: size }
      : { left: offset, top: 0, width: size, height };

  const [startStdev, endStdev, interiorStdev] = await Promise.all([
    regionStdev(cropped, extractRegion(0, startSize)),
    regionStdev(cropped, extractRegion((isVertical ? height : width) - endSize, endSize)),
    regionStdev(cropped, extractRegion(startSize, interiorSize)),
  ]);

  return Math.max(startStdev, endStdev) > interiorStdev;
}

/** Resizes+crops one source image into every target aspect ratio. Never stretches. */
export async function formatImageAllRatios(input: Buffer): Promise<FormattedAsset[]> {
  await assertSupportedImage(input);

  const results: FormattedAsset[] = [];
  for (const aspectRatio of ASPECT_RATIOS) {
    const { width, height } = TARGET_SIZES[aspectRatio];
    const buffer = await sharp(input)
      .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
      .jpeg()
      .toBuffer();

    const safeZoneWarning = await checkSafeZone(buffer, width, height, SAFE_ZONE_MARGINS[aspectRatio]);

    results.push({ aspectRatio, width, height, buffer, safeZoneWarning });
  }
  return results;
}
