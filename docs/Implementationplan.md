Contentify — Implementation Plan
Context
contentify/ contains four spec documents and nothing else. Greenfield build.

The system is the founder's internal content system that markets a separate SaaS product. Two halves:

Idea Engine — polls free sources all day; once a day turns raw signals into 3 ranked, sourced, hook-ready ideas. Solves the bottleneck named in PRD §3: coming up with ideas and hooks.
Content Machine — takes one approved idea, produces platform-native drafts (Instagram, LinkedIn, X, TikTok first), each correctly toned, captioned, sized, behind a mandatory approval gate.
The binding constraint is the one-job rule: every agent reads one fixed input, writes one fixed output, and agents never call each other. This plan enforces it with shared plumbing and HTTP boundaries rather than discipline.

Decisions locked
Decision	Choice	Consequence
App scope	Single-tenant, multi-tenant-ready schema	One seeded brands row, Supabase Auth restricted to one email. Every table carries brand_id so multi-tenancy is a later migration, not a rewrite. No RLS in v1.
LLM provider	Google Gemini API	@google/genai with responseSchema. One lib/gemini.ts, no provider abstraction.
Scheduling	GitHub Actions cron → API routes	Works on Vercel Hobby. Collector every 20 min, ideas daily. Shared-secret auth.
First connector	Deferred	Ships as READY_TO_POST manual export first. Phases 11–13 gated, not cut.
Doc deltas in Phase 0: Architecture.md §3 + Rules.md §2 say "OpenAI API / Claude API" and "Vercel Cron" — both now wrong. Move the four docs into docs/.

Two spec tensions, resolved
1. Competitor-recency check vs. the no-scraping rule. Rules.md §1.7 forbids scraping platforms without a public API, but the Researcher must check what competitors posted in the last 7–14 days.

→ tracked_competitors stores legally pollable sources only (RSS/Atom, blogs, newsletter archives, public subreddit/HN activity, official APIs). The collector ingests them into raw_signals with source_kind='competitor'. The recency check becomes a similarity query over data already collected legally, never a live scrape. A competitor reachable only by scraping is manual_only; the Researcher treats an absent competitor as unknown, not clear.

2. Serverless timeout vs. a 3-agent orchestrator. Three sequential Gemini calls exceed Vercel's function budget.

→ Each agent gets its own cron-triggered stage endpoint; GitHub Actions chains them. Fixes the timeout and makes the one-job rule structural — an agent physically cannot call another across an HTTP boundary.

Repository layout

app/
  (dashboard)/            dashboard · ideas · content · calendar
                          pipeline · analytics · settings
  api/
    ideas/collect|research|hooks|finalize/route.ts
    content/ingest|generate/route.ts
    publish/route.ts   analytics/route.ts
agents/                   _shared.md + 7 verbatim prompt files
connectors/               base.ts · manual.ts · <platform>/
services/                 collector/ · orchestrator.ts · media.ts
                          brandVoice.ts · analytics.ts · memory.ts
lib/                      config.ts · db.ts · gemini.ts · auth.ts
types/                    database.ts · platformRules.ts · agents.ts
tests/ · docs/ · supabase/migrations/ · .github/workflows/
Shared foundations (Block A — everything later depends on these)
lib/config.ts — validates env at import time. Hard-asserts Rules.md §1.1: throws at boot if AUTO_PUBLISH=true while HUMAN_APPROVAL_REQUIRED=true.

lib/db.ts — browser (anon) and server (service-role) Supabase clients; service-role import-guarded to server files only (Rules.md §1.6).

lib/gemini.ts — the only place any model is ever called:


runAgent<T>({ agentName, promptFile, input, schema }): Promise<{ data: T; warnings: string[] }>
Prepends agents/_shared.md, loads the prompt, calls Gemini with responseMimeType: 'application/json' + responseSchema, validates against Zod, and on failure retries once with a stricter instruction, then flags for manual review — implementing that Rules.md §3 row globally instead of per-agent. Every call writes an agent_runs row.

⚠️ Verify current Gemini model + embedding IDs at build time. Put them in GEMINI_MODEL / GEMINI_EMBEDDING_MODEL; don't hardcode a guess.

agents/*.md — the seven Rules.md §4 prompts, verbatim, as markdown so the founder can edit them without touching code (Rules.md §5).

connectors/base.ts + manual.ts returning NOT_SUPPORTED → READY_TO_POST. Existing from day one means the Phase 12 fallback needs no retrofit and Rules.md §1.3 can't be violated by omission.

Agent I/O contracts
Agent	Reads	Writes	Output schema
Collector	source APIs/feeds	raw_signals	(not an LLM agent)
Researcher	raw_signals, tracked_competitors, cooldown log	briefs	{ openings[] }, top 3
Hook-writer	one briefs row	hooks	{ brief_id, survivors[] }
Idea-finalizer	one hooks row	ingestion object	{ title, content, content_type, media[], original_platform, goal, audience, cta, brand_voice }
Content Analyzer	ingestion object	content.analysis	{ core_idea, hook, key_points[], facts_to_preserve[], visual_requirements, needs_clarification[] }
Platform Adapter	analysis + voice + rules	content_versions	one object per platform
Caption Agent	platform + adapted content + voice	content_versions.caption	{ hook, body, cta, hashtags[], first_comment }
Performance Agent	posts + metrics	performance_reports	{ observed, interpretation, recommendations[], next_test }
Block A — Foundations (Phases 0–1)
Phase 0 — Skeleton. Next.js 15 App Router + TS, Tailwind, shadcn/ui. .gitignore + .env.example. Supabase connected. Docs moved + deltas applied. Hello-world on Vercel.

Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_EMBEDDING_MODEL, CRON_SECRET, ALLOWED_FOUNDER_EMAIL, AUTO_PUBLISH=false, HUMAN_APPROVAL_REQUIRED=true.

Phase 1 — Database + the five foundations. One migration.

Enums: platform (10 values), content_status (DRAFT → READY_TO_POST, 7 values), competitor_recency (clear/trending/recently_covered).


tracked_competitors(id, brand_id, name, platform, handle_or_url,
                    feed_url, manual_only bool default false, added_at)
raw_signals(id, source, source_kind, competitor_id → tracked_competitors,
            keyword_matched, title, url unique, raw_content,
            engagement_score, fetched_at)
briefs(id, brand_id, run_id, opening, angle_type, evidence jsonb,
       competitor_recency, competitor_note, score jsonb, rank, status, created_at)
hooks(id, brief_id → briefs, hook_text, rationale, status, created_at)
agent_runs(id, run_id, agent_name, step_order, input jsonb, output jsonb,
           status, duration_ms, started_at, finished_at)
Plus content-machine tables: users, brands, content, content_assets, content_versions, platforms, platform_connections, scheduled_posts, published_posts, analytics, performance_reports, content_memory, system_logs.

Columns that must exist now to avoid painful migrations:

Column	Why
scheduled_posts.idempotency_key unique	Rules.md §3 duplicate protection
content_versions.status	Approval is per-platform-version, not per-idea
analytics.* metrics nullable	Store null, never guess
content_memory.embedding vector	Enable pgvector now, Phase 14 uses it
content.analysis jsonb	facts_to_preserve, read by every adapter
Indexes on raw_signals(fetched_at), raw_signals(url), briefs(created_at, status), agent_runs(run_id, step_order), content_versions(content_id, platform). Seed one brand, one user, ten platforms.

Block B — Idea Engine (Phases 2–3) · the core value
Phase 2 — Collector. services/collector/ with one adapter per source sharing fetchSignals(). api/ideas/collect guarded by CRON_SECRET. Dedupe on url. Competitor feeds via the same rss.ts with source_kind='competitor'. .github/workflows/collect.yml at */20 * * * *.

Phase 3 — Idea agents. Seed tracked_competitors. Three stage endpoints, one agent each: api/ideas/research → briefs, api/ideas/hooks → hooks, api/ideas/finalize → ingestion object. Cooldown v1 = pg_trgm over the last 5 briefs' angle_type (deliberately cheap; Phase 14 upgrades to vector). services/orchestrator.ts assigns one run_id; daily-ideas.yml chains the stages. /ideas shows 3 openings with evidence links and a competitor_recency badge.

Done when: 3 ranked sourced ideas land daily, and a deliberate recently_covered fixture is verifiably dropped or re-framed.

Block C — Content Machine (Phases 4–7)
4 — Brand voice. brands.voice_profile JSONB { tone, words_to_use[], words_to_avoid[], hashtag_rules, emoji_rules, cta_style }. /settings editor. services/brandVoice.ts is the single retrieval point.

5 — Ingestion + analyzer. api/content/ingest accepts the finalizer's schema or a pasted post. api/content/generate runs the Content Analyzer → content.analysis.

6 — Adapters. Master Adaptation Agent, Instagram + LinkedIn only. types/platformRules.ts holds per-platform constraints.

7 — Captions. Caption Agent → { hook, body, cta, hashtags[], first_comment }. cta: null is a valid, expected result.

Cross-cutting guard: tests/factsPreserved.test.ts asserts every facts_to_preserve string appears verbatim in each version. Rules.md §1.2 is the rule most likely to be silently violated — it needs a test, not a hope.

Block D — Review & Scheduling (Phases 8–10)
8 — Media. services/media.ts via sharp: 4:5, 1:1, 9:16, 16:9, 2:3, attention-preserving crop, safe zones. Never stretch. → Supabase Storage + content_assets.

9 — Approval dashboard. /content driving content_versions.status through the seven statuses with Edit/Approve/Reject/Regenerate. No publish path may bypass it.

10 — Calendar. /calendar today/week/month over scheduled_posts.

Done when a draft goes idea → approve → schedule → export pack with zero platform APIs connected. This is the first point the system is genuinely useful — treat it as the primary milestone.

Block E — Publishing & Analytics (Phases 11–13) · gated
11 — one connector on connectors/base.ts; OAuth tokens encrypted server-side; scopes verified at connection time, not publish time; idempotency key checked before every attempt. 12 — remaining connectors, same interface; no-API platforms resolve to READY_TO_POST, never PUBLISHED. 13 — per-platform metrics, null for anything unexposed.

Block F — Learning & Launch (Phases 14–17)
14 — embed published posts into content_memory (pgvector); Performance Agent keeping observed and interpretation strictly separate; repoint the Researcher's cooldown to vector similarity. 15 — /pipeline over agent_runs, cheap because runAgent has logged since Block A. 16 — failure-path suite: expired token, invalid media, mid-publish timeout, duplicate publish. 17 — confirm the two safety env vars in production, run one real piece end to end.

Verification
npm run build + tsc --noEmit clean after every phase.
A: row insert/select in every table; confirm boot throws when AUTO_PUBLISH=true.
B: manual collect trigger with the cron secret; run three stages, inspect agent_runs for three steps under one run_id; confirm the fixture drop.
C: facts-preserved test + a manual read — the two drafts must not read as the same text reshaped.
D: full manual walk to export pack.
F: the Rules.md §3 failure-path suite.
Three tests worth writing early: facts-preserved, idempotency duplicate rejection, AUTO_PUBLISH boot assertion.

Risks
Gemini model IDs — verify at build time, don't trust a guess.
Structured output drift — responseSchema doesn't cover every JSON Schema feature; the Zod layer is what actually guarantees the contract, so it can't be skipped for "simple" agents.
Reddit API requires OAuth even for reads; budget time in Phase 2.
Idea quality is the real product risk. If Block B produces bland ideas, the system's value collapses regardless of how well C–F work. Iterate on researcher.md and hookWriter.md against real signals before moving to Block C.
