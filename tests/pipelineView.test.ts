/**
 * Phase 15 — shaping decisions for the /pipeline view. The bug this guards
 * against: a run reading as finished while one of its steps is still
 * `running`, or steps rendering out of the order they actually executed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, groupRunsByDay, groupRunsByRunId, runStatus, type AgentRunRow } from "../services/pipelineView.ts";

function row(overrides: Partial<AgentRunRow> & { id: string }): AgentRunRow {
  return {
    run_id: "run-1",
    agent_name: "researcher",
    step_order: 1,
    input: {},
    output: null,
    status: "succeeded",
    duration_ms: 100,
    started_at: "2026-09-12T10:00:00Z",
    finished_at: "2026-09-12T10:00:01Z",
    ...overrides,
  };
}

test("groupRunsByRunId orders steps by step_order regardless of insertion order", () => {
  const rows = [
    row({ id: "a", step_order: 3, agent_name: "ideaFinalizer" }),
    row({ id: "b", step_order: 1, agent_name: "researcher" }),
    row({ id: "c", step_order: 2, agent_name: "hookWriter" }),
  ];

  const [run] = groupRunsByRunId(rows);
  assert.deepEqual(
    run.steps.map((s) => s.agent_name),
    ["researcher", "hookWriter", "ideaFinalizer"],
  );
});

test("groupRunsByRunId sorts runs newest-first by their first step's started_at", () => {
  const rows = [
    row({ id: "a", run_id: "old", started_at: "2026-09-10T10:00:00Z" }),
    row({ id: "b", run_id: "new", started_at: "2026-09-12T10:00:00Z" }),
  ];

  const runs = groupRunsByRunId(rows);
  assert.deepEqual(
    runs.map((r) => r.runId),
    ["new", "old"],
  );
});

test("runStatus is running if any step is still running, even alongside a failure", () => {
  const steps = [row({ id: "a", status: "failed_validation" }), row({ id: "b", status: "running" })];
  assert.equal(runStatus(steps), "running");
});

test("runStatus is failed if any step failed validation and none are still running", () => {
  const steps = [row({ id: "a", status: "succeeded" }), row({ id: "b", status: "failed_validation" })];
  assert.equal(runStatus(steps), "failed");
});

test("runStatus is succeeded only when every step succeeded", () => {
  const steps = [row({ id: "a", status: "succeeded" }), row({ id: "b", status: "succeeded" })];
  assert.equal(runStatus(steps), "succeeded");
});

test("groupRunsByDay buckets runs by calendar day and preserves newest-first order within a day", () => {
  const runs = groupRunsByRunId([
    row({ id: "a", run_id: "r1", started_at: "2026-09-12T08:00:00" }),
    row({ id: "b", run_id: "r2", started_at: "2026-09-12T18:00:00" }),
    row({ id: "c", run_id: "r3", started_at: "2026-09-11T08:00:00" }),
  ]);

  const days = groupRunsByDay(runs);
  assert.equal(days.length, 2);
  assert.deepEqual(
    days[0].runs.map((r) => r.runId),
    ["r2", "r1"],
  );
  assert.deepEqual(
    days[1].runs.map((r) => r.runId),
    ["r3"],
  );
});

test("formatDuration renders sub-second durations in ms and longer ones in seconds", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(450), "450ms");
  assert.equal(formatDuration(2300), "2.3s");
});
