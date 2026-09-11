/**
 * LinkedIn's little Text Format is exacting and silent about mistakes: an
 * unescaped reserved character doesn't warn, it mangles or rejects the
 * founder's caption at publish time. These assertions pin the two rules that
 * matter — escape everything reserved, and emit hashtags as templates so
 * they're actually clickable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommentary, escapeLittleText, hashtagTemplate } from "../connectors/linkedin/commentary.ts";

test("every reserved character is escaped, backslash included", () => {
  assert.equal(escapeLittleText("a|b{c}d@e[f]g(h)i<j>k#l\\m*n_o~p"), "a\\|b\\{c\\}d\\@e\\[f\\]g\\(h\\)i\\<j\\>k\\#l\\\\m\\*n\\_o\\~p");
});

test("plain text passes through untouched", () => {
  assert.equal(escapeLittleText("Shipped the thing. It works."), "Shipped the thing. It works.");
});

test("hashtags become clickable templates, with or without a leading hash", () => {
  assert.equal(hashtagTemplate("#buildinpublic"), "{hashtag|\\#|buildinpublic}");
  assert.equal(hashtagTemplate("buildinpublic"), "{hashtag|\\#|buildinpublic}");
  assert.equal(hashtagTemplate("  #  "), null);
});

test("a caption assembles as hook, body, CTA, hashtags, separated by blank lines", () => {
  const commentary = buildCommentary({
    hook: "We shipped it.",
    body: "Took 3 weeks (longer than planned).",
    cta: "Try it.",
    hashtags: ["#buildinpublic", "shipping"],
  });

  assert.equal(
    commentary,
    "We shipped it.\n\nTook 3 weeks \\(longer than planned\\).\n\nTry it.\n\n{hashtag|\\#|buildinpublic} {hashtag|\\#|shipping}",
  );
});

test("a null CTA and no hashtags leave no empty blocks behind", () => {
  assert.equal(buildCommentary({ hook: "Hook.", body: "Body.", cta: null, hashtags: [] }), "Hook.\n\nBody.");
});
