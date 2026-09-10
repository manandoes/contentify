/**
 * Phase 5+6+7 generate pipeline (Content Analyzer -> Master Adaptation
 * Agent -> Caption Agent), extracted from app/api/content/generate/route.ts
 * so Phase 9's Regenerate action can re-run the exact same pipeline without
 * a self-fetch back into the route or a duplicated copy of this logic —
 * both callers now share one implementation. content_versions.status is
 * left untouched here (Phase 9 owns those transitions, see
 * services/approvalWorkflow.ts); a regenerated version keeps whatever
 * status the caller left it at, then the caller applies its own transition.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "@/lib/gemini";
import { findMissingFacts } from "@/lib/factsPreserved";
import { getBrandVoice } from "@/services/brandVoice";
import { nextStepOrder, resolveRunId } from "@/services/orchestrator";
import { captionAgentOutputSchema, contentAnalyzerOutputSchema, platformAdapterOutputSchema } from "@/types/agents";
import { PLATFORM_RULES, type AdapterPlatform } from "@/types/platformRules";
import type { Database, Json } from "@/types/database";

type ContentVersionRow = Database["public"]["Tables"]["content_versions"]["Row"];

export class GenerateError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

export interface GenerateResult {
  runId: string;
  contentId: string;
  analysis: Json;
  versions: Pick<ContentVersionRow, "id" | "platform" | "adapted_content" | "caption" | "warnings" | "status">[];
}

export async function runContentGenerate(
  db: SupabaseClient<Database>,
  contentId: string,
  providedRunId?: string,
): Promise<GenerateResult> {
  const { data: content, error: contentError } = await db
    .from("content")
    .select("id, brand_id, title, original_content, content_type, goal, audience, cta")
    .eq("id", contentId)
    .maybeSingle();

  if (contentError) {
    throw new GenerateError(`Failed to load content ${contentId}: ${contentError.message}`, 500);
  }
  if (!content) {
    throw new GenerateError(`content ${contentId} not found`, 404);
  }

  const runId = resolveRunId(providedRunId);

  // Rules.md §4 Content Analyzer INPUT: "the original content object
  // (title, content, media, goal, audience, CTA)". Media isn't in this
  // shape yet — content_assets rows are a Phase 8 concern.
  const input: Json = {
    title: content.title,
    content: content.original_content,
    content_type: content.content_type,
    media: [],
    goal: content.goal,
    audience: content.audience,
    cta: content.cta,
  };

  const stepOrder = await nextStepOrder(db, runId);
  const output = await runAgent({
    runId,
    agentName: "contentAnalyzer",
    stepOrder,
    promptFile: "contentAnalyzer.md",
    input,
    schema: contentAnalyzerOutputSchema,
  });

  const { error: updateError } = await db
    .from("content")
    .update({ analysis: output as Json })
    .eq("id", content.id);

  if (updateError) {
    throw new GenerateError(`Failed to save analysis for content ${content.id}: ${updateError.message}`, 500);
  }

  // Phase 6: Master Adaptation Agent. Rules.md §4 INPUT is "ORIGINAL
  // CONTENT + CONTENT ANALYSIS + BRAND VOICE + PLATFORM RULES".
  const { voiceProfile } = await getBrandVoice(content.brand_id, db);

  const adapterInput: Json = {
    original_content: {
      title: content.title,
      content: content.original_content,
      goal: content.goal,
      audience: content.audience,
      cta: content.cta,
    },
    analysis: output as Json,
    brand_voice: voiceProfile as unknown as Json,
    platform_rules: PLATFORM_RULES as unknown as Json,
  };

  const adapterStepOrder = await nextStepOrder(db, runId);
  const adapted = await runAgent({
    runId,
    agentName: "platformAdapter",
    stepOrder: adapterStepOrder,
    promptFile: "platformAdapter.md",
    input: adapterInput,
    schema: platformAdapterOutputSchema,
  });

  const platforms = Object.keys(PLATFORM_RULES) as AdapterPlatform[];
  const versionRows = platforms.map((platform) => {
    const version = adapted[platform];
    // Rules.md §1.2 — flag, never silently drop, a fact the agent lost.
    const missingFacts = findMissingFacts(output.facts_to_preserve, version);
    const warnings = missingFacts.length
      ? [...version.warnings, ...missingFacts.map((fact) => `facts_to_preserve missing verbatim: "${fact}"`)]
      : version.warnings;

    return {
      content_id: content.id,
      platform,
      adapted_content: version as Json,
      warnings,
    };
  });

  const { data: versions, error: versionsError } = await db
    .from("content_versions")
    .upsert(versionRows, { onConflict: "content_id,platform" })
    .select("id, platform, adapted_content, warnings, status");

  if (versionsError) {
    throw new GenerateError(`Failed to save content_versions for content ${content.id}: ${versionsError.message}`, 500);
  }

  // Phase 7: Caption Agent, once per platform version (sequential — same
  // per-item loop pattern as app/api/ideas/hooks/route.ts — so
  // agent_runs.step_order stays meaningful). Rules.md §4 INPUT is "platform,
  // adapted content, brand voice, CTA, audience".
  const finalVersions: GenerateResult["versions"] = [];
  for (const version of versions ?? []) {
    const captionInput: Json = {
      platform: version.platform,
      adapted_content: version.adapted_content,
      brand_voice: voiceProfile as unknown as Json,
      cta: content.cta,
      audience: content.audience,
    };

    const captionStepOrder = await nextStepOrder(db, runId);
    const caption = await runAgent({
      runId,
      agentName: "captionAgent",
      stepOrder: captionStepOrder,
      promptFile: "captionAgent.md",
      input: captionInput,
      schema: captionAgentOutputSchema,
    });

    const missingFacts = findMissingFacts(output.facts_to_preserve, caption);
    const warnings = missingFacts.length
      ? [...caption.warnings, ...missingFacts.map((fact) => `facts_to_preserve missing verbatim: "${fact}"`)]
      : caption.warnings;

    const { data: updated, error: captionError } = await db
      .from("content_versions")
      .update({ caption: caption as Json, warnings })
      .eq("id", version.id)
      .select("id, platform, adapted_content, caption, warnings, status")
      .single();

    if (captionError || !updated) {
      throw new GenerateError(`Failed to save caption for content_version ${version.id}: ${captionError?.message}`, 500);
    }

    finalVersions.push(updated);
  }

  return { runId, contentId: content.id, analysis: output as Json, versions: finalVersions };
}
