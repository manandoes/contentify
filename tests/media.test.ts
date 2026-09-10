import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { formatImageAllRatios } from "../services/media.ts";
import { ASPECT_RATIOS } from "../types/enums.ts";

const TARGET_SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "2:3": { width: 1080, height: 1620 },
};

/** A plain, low-detail landscape source with an optional bright/noisy patch. */
async function makeTestImage(opts?: { patch: "top" | "bottom" | "center" }): Promise<Buffer> {
  const width = 1600;
  const height = 900;
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 40, b: 40 } },
  });

  if (!opts) {
    return base.jpeg().toBuffer();
  }

  const patchHeight = Math.round(height * 0.15);
  const top = opts.patch === "top" ? 0 : opts.patch === "bottom" ? height - patchHeight : Math.round((height - patchHeight) / 2);

  // High-frequency noise patch — gives the region a much higher stdev
  // (visual "interest") than the flat background around it.
  const noise = await sharp({
    create: {
      width,
      height: patchHeight,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 80 },
    },
  })
    .png()
    .toBuffer();

  return base
    .composite([{ input: noise, left: 0, top }])
    .jpeg()
    .toBuffer();
}

test("produces one correctly-sized, exact-ratio output per target aspect ratio", async () => {
  const input = await makeTestImage();
  const results = await formatImageAllRatios(input);

  assert.equal(results.length, ASPECT_RATIOS.length);
  for (const asset of results) {
    const target = TARGET_SIZES[asset.aspectRatio];
    assert.equal(asset.width, target.width);
    assert.equal(asset.height, target.height);

    const metadata = await sharp(asset.buffer).metadata();
    assert.equal(metadata.width, target.width);
    assert.equal(metadata.height, target.height, `${asset.aspectRatio} output must never be stretched to a different ratio`);
  }
});

test("never stretches: every crop's pixel ratio matches its named ratio exactly", async () => {
  const input = await makeTestImage();
  const results = await formatImageAllRatios(input);

  const expectedRatio: Record<string, number> = {
    "1:1": 1 / 1,
    "4:5": 4 / 5,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "2:3": 2 / 3,
  };

  for (const asset of results) {
    const actual = asset.width / asset.height;
    assert.ok(
      Math.abs(actual - expectedRatio[asset.aspectRatio]) < 0.01,
      `${asset.aspectRatio} output ratio ${actual} should match ${expectedRatio[asset.aspectRatio]}`,
    );
  }
});

test("safe-zone check flags a 9:16 crop when detail concentrates in the reserved top band", async () => {
  const input = await makeTestImage({ patch: "top" });
  const results = await formatImageAllRatios(input);
  const vertical = results.find((asset) => asset.aspectRatio === "9:16")!;
  assert.equal(vertical.safeZoneWarning, true);
});

test("safe-zone check does not flag a 9:16 crop when detail is centered", async () => {
  const input = await makeTestImage({ patch: "center" });
  const results = await formatImageAllRatios(input);
  const vertical = results.find((asset) => asset.aspectRatio === "9:16")!;
  assert.equal(vertical.safeZoneWarning, false);
});

test("rejects a non-image input with a clear, specific error", async () => {
  const notAnImage = Buffer.from("this is plain text, not an image");
  await assert.rejects(() => formatImageAllRatios(notAnImage), /Not a readable image file/);
});
