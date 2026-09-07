/**
 * The only place any of the 7 agents ever calls a model. Everything the
 * one-job rule needs is enforced here rather than per-agent:
 *
 *  - loads the agent's prompt from agents/*.md verbatim (plus agents/_shared.md
 *    for the content-machine agents — see each prompt file's own header comment)
 *  - asks Gemini for JSON matching the agent's Zod schema
 *  - on a schema-validation failure, retries once with a stricter instruction,
 *    then throws AgentValidationError rather than fabricating (Rules.md §3
 *    "AI output fails schema validation")
 *  - logs every call to agent_runs (input, output, status, duration) —
 *    this is what makes the Phase 15 /pipeline view free to build later
 */
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import { config } from "./config";
import { supabaseServer } from "./db";
import type { Json } from "@/types/database";

const AGENTS_DIR = path.join(process.cwd(), "agents");
const SHARED_RULES = readFileSync(path.join(AGENTS_DIR, "_shared.md"), "utf-8");

const promptCache = new Map<string, string>();
function loadPrompt(promptFile: string): string {
  let prompt = promptCache.get(promptFile);
  if (!prompt) {
    prompt = readFileSync(path.join(AGENTS_DIR, promptFile), "utf-8");
    promptCache.set(promptFile, prompt);
  }
  return prompt;
}

let genAI: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!genAI) genAI = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return genAI;
}

/**
 * Thrown when an agent's output fails schema validation twice in a row
 * (once, then once more after a stricter instruction). Per Rules.md §3
 * this means "flag for manual review" — the caller (a route handler)
 * should surface this as a failed pipeline step, never swallow it and
 * substitute fabricated output.
 */
export class AgentValidationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown,
    public readonly issues: unknown,
  ) {
    super(message);
    this.name = "AgentValidationError";
  }
}

export interface RunAgentOptions<T> {
  /** Shared across every stage of one pipeline run — see services/orchestrator.ts (Phase 3). */
  runId: string;
  agentName: string;
  stepOrder: number;
  /** Filename under agents/, e.g. "researcher.md". */
  promptFile: string;
  /** Must already be JSON-serializable — this is logged verbatim to agent_runs.input. */
  input: Json;
  schema: ZodType<T>;
  /**
   * The idea-engine agents (researcher, hookWriter, ideaFinalizer) have
   * complete, self-contained rule sets and deliberately do NOT inherit
   * agents/_shared.md — see the header comment in each of their prompt
   * files. Content-machine agents default to inheriting it.
   */
  inheritsSharedRules?: boolean;
}

type AttemptResult<T> =
  | { ok: true; data: T; raw: unknown }
  | { ok: false; raw: unknown; issues: unknown };

export async function runAgent<T>(opts: RunAgentOptions<T>): Promise<T> {
  const { runId, agentName, stepOrder, promptFile, input, schema, inheritsSharedRules = true } = opts;

  const agentPrompt = loadPrompt(promptFile);
  const systemInstruction = inheritsSharedRules ? `${agentPrompt}\n\n${SHARED_RULES}` : agentPrompt;
  const jsonSchema = z.toJSONSchema(schema);

  const db = supabaseServer();
  const startedAt = new Date();
  const start = Date.now();

  const { data: runRow, error: insertError } = await db
    .from("agent_runs")
    .insert({
      run_id: runId,
      agent_name: agentName,
      step_order: stepOrder,
      input,
      status: "running",
      started_at: startedAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !runRow) {
    throw new Error(`Failed to open agent_runs row for ${agentName}: ${insertError?.message}`);
  }

  async function attempt(extraInstruction?: string): Promise<AttemptResult<T>> {
    const response = await client().models.generateContent({
      model: config.gemini.model,
      contents: JSON.stringify(input),
      config: {
        systemInstruction: extraInstruction ? `${systemInstruction}\n\n${extraInstruction}` : systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    });

    const text = response.text;
    if (!text) return { ok: false, raw: null, issues: "Empty response from Gemini" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, raw: text, issues: "Response was not valid JSON" };
    }

    const result = schema.safeParse(parsed);
    if (result.success) return { ok: true, data: result.data, raw: parsed };
    return { ok: false, raw: parsed, issues: result.error.issues };
  }

  let result = await attempt();
  if (!result.ok) {
    // Rules.md §3: "AI output fails schema validation → Retry once with a
    // stricter instruction, then flag for manual review."
    result = await attempt(
      `Your previous output failed schema validation with these issues: ${JSON.stringify(result.issues)}. ` +
        `Return ONLY valid JSON that exactly matches the required schema — no prose, no markdown code fences.`,
    );
  }

  const durationMs = Date.now() - start;
  const finishedAt = new Date().toISOString();

  if (!result.ok) {
    await db
      .from("agent_runs")
      .update({
        output: result.raw as Json,
        status: "failed_validation",
        duration_ms: durationMs,
        finished_at: finishedAt,
      })
      .eq("id", runRow.id);

    throw new AgentValidationError(
      `${agentName} output failed schema validation twice — flagged for manual review (agent_runs.id=${runRow.id}).`,
      result.raw,
      result.issues,
    );
  }

  await db
    .from("agent_runs")
    .update({
      output: result.data as Json,
      status: "succeeded",
      duration_ms: durationMs,
      finished_at: finishedAt,
    })
    .eq("id", runRow.id);

  return result.data;
}
