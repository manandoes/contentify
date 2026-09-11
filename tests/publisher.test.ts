/**
 * Duplicate-publish rejection — one of the three tests
 * Implementationplan.md flags as worth writing early, and the rule most
 * expensive to get wrong: a false negative here means a post goes out twice
 * on a real feed, with no undo.
 *
 * Tests the guard in services/approvalWorkflow.ts rather than the whole publisher: the guard is where
 * the decision lives; everything around it is database plumbing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ATTEMPTS, guardPublish } from "../services/approvalWorkflow.ts";

test("a scheduled post that already published is never published again", () => {
  const guard = guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: "PUBLISHED", attempts: 0 });
  assert.equal(guard.proceed, false);
  assert.equal(guard.proceed === false && guard.alreadyPublished, true);
});

test("any recorded outcome blocks a second attempt, not just PUBLISHED", () => {
  for (const outcome of ["PUBLISHED", "READY_TO_POST", "FAILED"] as const) {
    assert.equal(guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: outcome, attempts: 0 }).proceed, false);
  }
});

test("only a SCHEDULED version may publish — the human gate cannot be skipped", () => {
  for (const status of ["DRAFT", "READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "FAILED", "READY_TO_POST"] as const) {
    assert.equal(guardPublish({ versionStatus: status, recordedOutcome: null, attempts: 0 }).proceed, false);
  }
  assert.equal(guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: null, attempts: 0 }).proceed, true);
});

test("retries stop at the attempt cap", () => {
  assert.equal(guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: null, attempts: MAX_ATTEMPTS - 1 }).proceed, true);
  assert.equal(guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: null, attempts: MAX_ATTEMPTS }).proceed, false);
});
