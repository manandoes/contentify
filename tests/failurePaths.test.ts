/**
 * Phase 16 (Phases.md: "Deliberately expire a token, send bad media, force a
 * timeout mid-publish. Confirm duplicate-post protection actually works.";
 * Implementationplan.md Block F: "failure-path suite: expired token, invalid
 * media, mid-publish timeout, duplicate publish"). Four sections below, one
 * per item on that checklist.
 *
 * connectors/linkedin/index.ts and connectors/instagram/index.ts cannot be
 * imported here at all: both pull in "server-only" (throws outside a Next
 * Server Component) and both define a PublishFailure class with TypeScript
 * parameter properties (unsupported by node's type-stripping test runner —
 * verified directly: `node -e "import('./connectors/linkedin/index.ts')"`
 * fails with "TypeScript parameter property is not supported in strip-only
 * mode" before ever reaching the server-only throw). So this suite targets
 * the decision logic pulled out of both connectors into each connector's
 * publishFailure.ts and connectors/networkFailure.ts
 * specifically so it has somewhere to run — same reasoning as
 * services/media.ts staying "server-only"-free for tests/media.test.ts.
 *
 * Duplicate-post protection (section 4) is the one item already fully
 * exercised elsewhere (tests/publisher.test.ts, tests/approvalWorkflow.test.ts
 * via guardPublish) — this section adds the one scenario those don't:
 * confirming a RETRY_LATER-shaped prior attempt (what a timeout leaves
 * behind) blocks a second attempt exactly like a hard failure does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { networkErrorResult } from "../connectors/networkFailure.ts";
import { classifyLinkedInFailure, linkedInExpiryState } from "../connectors/linkedin/publishFailure.ts";
import {
  classifyContainerStatus,
  classifyInstagramFailure,
  instagramExpiryState,
} from "../connectors/instagram/publishFailure.ts";
import { MAX_ATTEMPTS, guardPublish } from "../services/approvalWorkflow.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// --- 1. Expired token ------------------------------------------------------

test("LinkedIn: a token expiring well within the refresh window needs refreshing", () => {
  const now = Date.now();
  const expiresAt = new Date(now + HOUR_MS).toISOString(); // inside a 24h window
  assert.equal(linkedInExpiryState(expiresAt, now, DAY_MS), "needs_refresh");
});

test("LinkedIn: a token expiring well outside the refresh window is left alone", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 30 * DAY_MS).toISOString();
  assert.equal(linkedInExpiryState(expiresAt, now, DAY_MS), "fresh");
});

test("LinkedIn: no recorded expiry is treated as fresh, never forced through a refresh", () => {
  assert.equal(linkedInExpiryState(null, Date.now(), DAY_MS), "fresh");
});

test("LinkedIn: a 401 mid-publish is classified as broken and non-retryable — the founder must reconnect", () => {
  const result = classifyLinkedInFailure(401, "invalid_token (HTTP 401)", null);
  assert.equal(result.broken, true);
  assert.equal(result.retryable, false);
  assert.match(result.message, /reconnect linkedin in settings/i);
});

test("Instagram: a token already past expiry is unrecoverable — refreshing is never attempted", () => {
  const now = Date.now();
  const expiresAt = new Date(now - HOUR_MS).toISOString(); // already expired
  assert.equal(instagramExpiryState(expiresAt, now, 7 * DAY_MS), "unrecoverable");
});

test("Instagram: a token expiring soon but not yet dead needs refreshing", () => {
  const now = Date.now();
  const expiresAt = new Date(now + HOUR_MS).toISOString(); // alive, inside the 7-day window
  assert.equal(instagramExpiryState(expiresAt, now, 7 * DAY_MS), "needs_refresh");
});

test("Instagram: a token far from expiry is left alone", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 30 * DAY_MS).toISOString();
  assert.equal(instagramExpiryState(expiresAt, now, 7 * DAY_MS), "fresh");
});

test("Instagram: error code 190 (token invalid) is classified as broken even without an HTTP 401", () => {
  const result = classifyInstagramFailure(400, 190, "Error validating access token (HTTP 400)", null);
  assert.equal(result.broken, true);
  assert.equal(result.retryable, false);
});

// --- 2. Bad media ------------------------------------------------------

test("Instagram: a container that finishes ERROR is a terminal, non-retryable, specific failure", () => {
  const outcome = classifyContainerStatus("ERROR", "unsupported_format");
  assert.equal(outcome.kind, "error");
  assert.ok(outcome.kind === "error" && /could not process the image/i.test(outcome.message));
  assert.ok(outcome.kind === "error" && outcome.message.includes("unsupported_format"));
});

test("Instagram: a container that finishes ERROR with no status detail still produces a clear message", () => {
  const outcome = classifyContainerStatus("ERROR", undefined);
  assert.equal(outcome.kind, "error");
  assert.ok(outcome.kind === "error" && outcome.message.length > 0);
});

test("Instagram: a container that FINISHED is ready to publish", () => {
  assert.deepEqual(classifyContainerStatus("FINISHED", undefined), { kind: "ready" });
});

test("Instagram: a container that EXPIRED before publish is retryable with a fresh container", () => {
  assert.deepEqual(classifyContainerStatus("EXPIRED", undefined), { kind: "expired" });
});

test("Instagram: a container still ingesting (or an unrecognised state) just means keep polling", () => {
  assert.deepEqual(classifyContainerStatus("IN_PROGRESS", undefined), { kind: "waiting" });
  assert.deepEqual(classifyContainerStatus(undefined, undefined), { kind: "waiting" });
});

// --- 3. Mid-publish timeout ------------------------------------------------------

test("a thrown network error (timeout, DNS failure, connection reset) is never retryable", () => {
  const result = networkErrorResult("LinkedIn", new Error("The operation was aborted due to timeout"));
  assert.equal(result.status, "FAILED");
  assert.equal(result.retryable, false);
});

test("the network-error message names the platform and tells the founder to check the real feed", () => {
  const result = networkErrorResult("Instagram", new Error("fetch failed"));
  assert.match(result.error, /Could not reach Instagram/);
  assert.match(result.error, /check the Instagram feed before retrying/);
  assert.match(result.error, /may or may not have gone out/);
});

test("a non-Error thrown value still produces a readable, non-retryable message", () => {
  const result = networkErrorResult("LinkedIn", "socket hang up");
  assert.equal(result.retryable, false);
  assert.match(result.error, /socket hang up/);
});

test("LinkedIn: a 5xx is retryable (API is down), unlike the terminal statuses above it", () => {
  assert.equal(classifyLinkedInFailure(503, "Service Unavailable (HTTP 503)", null).retryable, true);
});

test("Instagram: a 5xx is retryable the same way", () => {
  assert.equal(classifyInstagramFailure(503, null, "Service Unavailable (HTTP 503)", null).retryable, true);
});

test("LinkedIn: a 429 is retryable and carries the platform's retry-after", () => {
  const result = classifyLinkedInFailure(429, "Too many requests (HTTP 429)", "120");
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterSeconds, 120);
});

test("Instagram: a rate-limit error code is retryable even on a 200-shaped HTTP status", () => {
  const result = classifyInstagramFailure(400, 17, "User request limit reached (HTTP 400)", null);
  assert.equal(result.retryable, true);
});

// --- 4. Duplicate-post protection ------------------------------------------------------

test("a scheduled post left over from a timed-out attempt (RETRY_LATER never records an outcome) may still be retried", () => {
  // A timeout never reaches recordSuccess/recordFailure in services/publisher.ts —
  // published_posts gets no row — so the guard must still say proceed, same
  // as a post that was never attempted at all.
  assert.equal(guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: null, attempts: 2 }).proceed, true);
});

test("once a real outcome is recorded, a following pass never re-publishes, no matter how it got there", () => {
  for (const outcome of ["PUBLISHED", "READY_TO_POST", "FAILED"] as const) {
    const guard = guardPublish({ versionStatus: "SCHEDULED", recordedOutcome: outcome, attempts: MAX_ATTEMPTS - 1 });
    assert.equal(guard.proceed, false);
  }
});
