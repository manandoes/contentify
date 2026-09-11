/**
 * Pure status-transition rules for content_versions.status, driven by the
 * Phase 9 approval screen's four actions (Edit / Approve / Reject /
 * Regenerate — Phases.md Phase 9). Implementationplan.md's generate route
 * comment says content_versions.status "is left at its DB default (DRAFT);
 * Phase 9 owns the approval-status transitions" — this file is that
 * ownership, kept dependency-free (no supabase, no "server-only") so the
 * rules are unit-testable in isolation, same as lib/factsPreserved.ts.
 *
 * It also owns the preconditions checked before a publish attempt
 * (guardPublish) — same reason, and they are mostly statements about status.
 *
 * Once a version moves past a human decision — SCHEDULED, PUBLISHED,
 * READY_TO_POST (later phases own these) — Phase 9 must not reopen it, so
 * every predicate below is deliberately conservative about what counts as
 * still "ours".
 */
import type { ContentStatus } from "@/types/enums";

const DECIDABLE: ReadonlySet<ContentStatus> = new Set(["DRAFT", "READY_FOR_REVIEW"]);
const EDITABLE: ReadonlySet<ContentStatus> = new Set(["DRAFT", "READY_FOR_REVIEW", "APPROVED", "FAILED"]);
const REGENERATABLE: ReadonlySet<ContentStatus> = new Set(["DRAFT", "READY_FOR_REVIEW", "APPROVED", "FAILED"]);
const SCHEDULABLE: ReadonlySet<ContentStatus> = new Set(["APPROVED"]);
const PUBLISHABLE: ReadonlySet<ContentStatus> = new Set(["SCHEDULED"]);

/** True for a version still awaiting its first Approve/Reject decision. */
export function isDecidable(status: ContentStatus): boolean {
  return DECIDABLE.has(status);
}

/** True for a version a founder may still hand-edit (caption text). */
export function isEditable(status: ContentStatus): boolean {
  return EDITABLE.has(status);
}

/** True for a version the generate pipeline may still safely overwrite. */
export function isRegeneratable(status: ContentStatus): boolean {
  return REGENERATABLE.has(status);
}

/** True for a version a founder may hand a scheduled_for date (Phase 10). */
export function isSchedulable(status: ContentStatus): boolean {
  return SCHEDULABLE.has(status);
}

/**
 * Rules.md §1.1, made structural: SCHEDULED is the only status a version can
 * publish from, and the only way to reach it is a human pressing Approve and
 * then Schedule. There is deliberately no branch here on AUTO_PUBLISH —
 * skipping the human gate isn't a configuration away, it's absent.
 */
export function isPublishable(status: ContentStatus): boolean {
  return PUBLISHABLE.has(status);
}

export type PublishOutcome = "PUBLISHED" | "READY_TO_POST" | "FAILED";

/**
 * Where a version lands after a publish attempt. FAILED maps to
 * READY_TO_POST, not FAILED, because Rules.md §3 says a failed publish
 * "Mark[s] FAILED with the platform's error message; keep[s] the content as
 * READY_TO_POST" — the FAILED half is recorded on the scheduled post
 * (status + last_error), while the content itself stays exportable so the
 * founder can post it by hand.
 */
export function statusAfterPublish(outcome: PublishOutcome): ContentStatus {
  return outcome === "PUBLISHED" ? "PUBLISHED" : "READY_TO_POST";
}

/** Result of the Schedule action. Callers must check isSchedulable() first. */
export function statusAfterSchedule(): ContentStatus {
  return "SCHEDULED";
}

export type ReviewDecision = "approve" | "reject";

/** Result of Approve/Reject. Callers must check isDecidable() first. */
export function statusAfterDecision(decision: ReviewDecision): ContentStatus {
  return decision === "approve" ? "APPROVED" : "FAILED";
}

/**
 * A hand-edit always lands a version back in the review queue: an edit to
 * a DRAFT/READY_FOR_REVIEW version keeps it pending its first decision, and
 * an edit to an already-decided APPROVED/FAILED version reopens it, since
 * the decision was made against text that no longer exists. Callers must
 * check isEditable() first.
 */
export function statusAfterEdit(): ContentStatus {
  return "READY_FOR_REVIEW";
}

/**
 * How many times a retryable failure is re-attempted before the scheduled
 * post is given up on. Each /api/publish pass is one attempt, so the cron
 * interval is the backoff — there is no sleeping inside a serverless
 * function, and a capped count is what Rules.md §3 asks for ("retry with
 * exponential backoff, cap attempts, then mark FAILED").
 */
export const MAX_ATTEMPTS = 5;

export type PublishGuard = { proceed: true } | { proceed: false; reason: string; alreadyPublished: boolean };

export interface GuardInput {
  versionStatus: ContentStatus;
  /** The outcome already recorded in published_posts for this scheduled post, if any. */
  recordedOutcome: ContentStatus | null;
  attempts: number;
}

/**
 * Rules.md §3, "Possible duplicate post": check the idempotency key's
 * recorded outcome before every attempt, and never retry blindly without
 * confirming the previous attempt's real outcome. A recorded outcome *is*
 * that confirmation — so once published_posts holds a row for this scheduled
 * post, no second attempt is made, whatever else is asked of us.
 */
export function guardPublish({ versionStatus, recordedOutcome, attempts }: GuardInput): PublishGuard {
  if (recordedOutcome !== null) {
    return {
      proceed: false,
      reason:
        recordedOutcome === "PUBLISHED"
          ? "Already published — refusing to post it a second time."
          : `This scheduled post already recorded an outcome (${recordedOutcome}).`,
      alreadyPublished: recordedOutcome === "PUBLISHED",
    };
  }

  // Rules.md §1.1's human gate: SCHEDULED is only reachable via Approve then
  // Schedule, both human actions on the Phase 9 screen.
  if (!PUBLISHABLE.has(versionStatus)) {
    return {
      proceed: false,
      reason: `Cannot publish a version that is ${versionStatus} — it must be approved and scheduled first.`,
      alreadyPublished: false,
    };
  }

  if (attempts >= MAX_ATTEMPTS) {
    return { proceed: false, reason: `Gave up after ${attempts} failed attempts.`, alreadyPublished: false };
  }

  return { proceed: true };
}
