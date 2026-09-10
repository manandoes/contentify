/**
 * Phase 5+6+7 (Architecture.md §4 /api/content/generate: "runs analyzer +
 * platform adapters" — one route, per that folder plan; Implementationplan.md's
 * repository layout has no separate caption route, so Phase 7 lands here
 * too). Runs the Content Analyzer over one ingested `content` row, stores
 * its output in content.analysis, then runs the Master Adaptation Agent
 * (Phase 6) and upserts one content_versions row per platform (Instagram +
 * LinkedIn — Phases.md: "start with 2, not 10"). Finally runs the Caption
 * Agent (Phase 7) once per platform version, reading that version's own
 * adapted_content, and saves its output to content_versions.caption.
 * content_versions.status is left at its DB default (DRAFT); Phase 9 owns
 * the approval-status transitions.
 */
import "server-only";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/db";
import { runAgent } from "@/lib/gemini";
import { findMissingFacts } from "@/lib/factsPreserved";
import { getBrandVoice } from "@/services/brandVoice";
import { nextStepOrder, resolveRunId } from "@/services/orchestrator";
import { captionAgentOutputSchema, contentAnalyzerOutputSchema, platformAdapterOutputSchema } from "@/types/agents";
import { PLATFORM_RULES, type AdapterPlatform } from "@/types/platformRules";
import type { Json } from "@/types/database";

interface RequestBody {
  contentId: string;
  runId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${config.cron.secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: content, error: contentError } = await db
    .from("content")
    .select("id, brand_id, title, original_content, content_type, goal, audience, cta")
    .eq("id", body.contentId)
    .maybeSingle();

  if (contentError) {
    return NextResponse.json({ error: `Failed to load content ${body.contentId}: ${contentError.message}` }, { status: 500 });
  }
  if (!content) {
    return NextResponse.json({ error: `content ${body.contentId} not found` }, { status: 404 });
  }

  const runId = resolveRunId(body.runId);

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
    return NextResponse.json({ error: `Failed to save analysis for content ${content.id}: ${updateError.message}` }, { status: 500 });
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
    return NextResponse.json({ error: `Failed to save content_versions for content ${content.id}: ${versionsError.message}` }, { status: 500 });
  }

  // Phase 7: Caption Agent, once per platform version (sequential — same
  // per-item loop pattern as app/api/ideas/hooks/route.ts — so
  // agent_runs.step_order stays meaningful). Rules.md §4 INPUT is "platform,
  // adapted content, brand voice, CTA, audience".
  const finalVersions = [];
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
      return NextResponse.json(
        { error: `Failed to save caption for content_version ${version.id}: ${captionError?.message}` },
        { status: 500 },
      );
    }

    finalVersions.push(updated);
  }

  return NextResponse.json({ runId, contentId: content.id, analysis: output, versions: finalVersions });
}
