import { test } from "node:test";
import assert from "node:assert/strict";
import { findMissingFacts } from "../lib/factsPreserved.ts";

test("passes when every fact appears verbatim", () => {
  const facts = ["revenue grew 47%", "shipped in 3 weeks"];
  const version = {
    hook: "Our revenue grew 47% in one quarter.",
    body: "The whole thing shipped in 3 weeks, start to finish.",
    cta: null,
  };
  assert.deepEqual(findMissingFacts(facts, version), []);
});

test("catches a rounded or reworded fact (Rules.md §1.2)", () => {
  const facts = ["revenue grew 47%"];
  const version = {
    hook: "We grew revenue by almost half.",
    body: "Big quarter for us.",
    cta: null,
  };
  assert.deepEqual(findMissingFacts(facts, version), ["revenue grew 47%"]);
});

test("checks the cta field too", () => {
  const facts = ["only 10 seats left"];
  const version = {
    hook: "Something",
    body: "Something else",
    cta: "only 10 seats left — book now",
  };
  assert.deepEqual(findMissingFacts(facts, version), []);
});
