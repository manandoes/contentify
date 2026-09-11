import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDecidable,
  isEditable,
  isPublishable,
  isRegeneratable,
  isSchedulable,
  statusAfterDecision,
  statusAfterEdit,
  statusAfterPublish,
  statusAfterSchedule,
} from "../services/approvalWorkflow.ts";

test("DRAFT and READY_FOR_REVIEW are decidable; everything else is not", () => {
  assert.equal(isDecidable("DRAFT"), true);
  assert.equal(isDecidable("READY_FOR_REVIEW"), true);
  for (const status of ["APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "READY_TO_POST"] as const) {
    assert.equal(isDecidable(status), false);
  }
});

test("approve/reject map to APPROVED/FAILED", () => {
  assert.equal(statusAfterDecision("approve"), "APPROVED");
  assert.equal(statusAfterDecision("reject"), "FAILED");
});

test("editing is blocked once a version is committed downstream", () => {
  for (const status of ["SCHEDULED", "PUBLISHED", "READY_TO_POST"] as const) {
    assert.equal(isEditable(status), false);
  }
  for (const status of ["DRAFT", "READY_FOR_REVIEW", "APPROVED", "FAILED"] as const) {
    assert.equal(isEditable(status), true);
  }
});

test("an edit always reopens the version for review", () => {
  assert.equal(statusAfterEdit(), "READY_FOR_REVIEW");
});

test("regenerate is blocked once a version is committed downstream", () => {
  for (const status of ["SCHEDULED", "PUBLISHED", "READY_TO_POST"] as const) {
    assert.equal(isRegeneratable(status), false);
  }
  assert.equal(isRegeneratable("APPROVED"), true);
});

test("only an approved version is schedulable", () => {
  assert.equal(isSchedulable("APPROVED"), true);
  for (const status of ["DRAFT", "READY_FOR_REVIEW", "SCHEDULED", "PUBLISHED", "FAILED", "READY_TO_POST"] as const) {
    assert.equal(isSchedulable(status), false);
  }
});

test("scheduling maps to SCHEDULED", () => {
  assert.equal(statusAfterSchedule(), "SCHEDULED");
});

test("SCHEDULED is the only status that may publish (Rules.md §1.1)", () => {
  assert.equal(isPublishable("SCHEDULED"), true);
  for (const status of ["DRAFT", "READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "FAILED", "READY_TO_POST"] as const) {
    assert.equal(isPublishable(status), false);
  }
});

test("a failed publish leaves the content exportable rather than dead", () => {
  assert.equal(statusAfterPublish("PUBLISHED"), "PUBLISHED");
  assert.equal(statusAfterPublish("READY_TO_POST"), "READY_TO_POST");
  assert.equal(statusAfterPublish("FAILED"), "READY_TO_POST");
});
