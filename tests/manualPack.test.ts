/**
 * The manual pack is the whole answer for every platform with no publishing
 * API (Phases.md Phase 12), so the two things it must never get wrong are
 * pinned here:
 *
 *  1. The caption it renders is the *same* text a connector would have sent,
 *     assembled by the one shared rule — otherwise posting by hand quietly
 *     produces different content from posting automatically.
 *  2. `first_comment` stays out of the caption. It is a separate comment, and
 *     folding it in would publish something the founder didn't approve as the
 *     post body (Rules.md §1.2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleCaption, plainHashtag } from "../connectors/captionText.ts";
import { renderManualPack, type ManualPack } from "../services/manualPackText.ts";

const caption = {
  hook: "We shipped it.",
  body: "Took 3 weeks (longer than planned).",
  cta: "Try it.",
  hashtags: ["#buildinpublic", "shipping"],
};

test("a caption assembles as hook, body, CTA, hashtags, separated by blank lines", () => {
  assert.equal(
    assembleCaption(caption),
    "We shipped it.\n\nTook 3 weeks (longer than planned).\n\nTry it.\n\n#buildinpublic #shipping",
  );
});

test("plain text is left exactly as written — no escaping outside LinkedIn", () => {
  assert.equal(assembleCaption({ ...caption, hashtags: [] }).includes("\\"), false);
});

test("a null CTA and no hashtags leave no empty blocks behind", () => {
  assert.equal(assembleCaption({ hook: "Hook.", body: "Body.", cta: null, hashtags: [] }), "Hook.\n\nBody.");
});

test("hashtags normalise to a single leading hash, and empty ones are dropped", () => {
  assert.equal(plainHashtag("#saas"), "#saas");
  assert.equal(plainHashtag("saas"), "#saas");
  assert.equal(plainHashtag("  #  "), null);
});

function pack(overrides: Partial<ManualPack> = {}): ManualPack {
  return {
    versionId: "v1",
    platform: "x",
    status: "READY_TO_POST",
    caption: assembleCaption(caption),
    firstComment: null,
    assets: [],
    warnings: [],
    generatedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

test("the rendered pack carries the caption verbatim", () => {
  assert.equal(renderManualPack(pack()).includes(assembleCaption(caption)), true);
});

test("the first comment is rendered as its own section, never inside the caption", () => {
  const rendered = renderManualPack(pack({ firstComment: "Full write-up in the link." }));
  const captionBlock = rendered.slice(rendered.indexOf("CAPTION"), rendered.indexOf("FIRST COMMENT"));

  assert.equal(rendered.includes("FIRST COMMENT"), true);
  assert.equal(captionBlock.includes("Full write-up in the link."), false);
});

test("the platform's own crop is the one marked, and the others are still offered", () => {
  const rendered = renderManualPack(
    pack({
      platform: "instagram",
      assets: [
        { aspectRatio: "1:1", url: "https://example.test/1x1.jpg", recommended: false },
        { aspectRatio: "4:5", url: "https://example.test/4x5.jpg", recommended: true },
      ],
    }),
  );

  assert.match(rendered, /4:5\s+<- use this one for Instagram/);
  assert.equal(rendered.includes("https://example.test/1x1.jpg"), true);
});

test("no media says so plainly rather than rendering an empty section", () => {
  assert.equal(renderManualPack(pack()).includes("No formatted media for this post."), true);
});
