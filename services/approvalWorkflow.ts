/**
 * Pure status-transition rules for content_versions.status, driven by the
 * Phase 9 approval screen's four actions (Edit / Approve / Reject /
 * Regenerate — Phases.md Phase 9). Implementationplan.md's generate route
 * comment says content_versions.status "is left at its DB default (DRAFT);
 * Phase 9 owns the approval-status transitions" — this file is that
 * ownership, kept dependency-free (no supabase, no "server-only") so the
 * rules are unit-testable in isolation, same as lib/factsPreserved.ts.
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
