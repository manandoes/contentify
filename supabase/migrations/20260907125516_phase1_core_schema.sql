-- Phase 1 — Database + core tables (Architecture.md §5, Phases.md Phase 1).
--
-- Layout: extensions -> enums -> content-machine tables -> idea-engine
-- tables -> indexes -> updated_at triggers -> access lockdown.
--
-- Access model: RLS is deliberately OFF in v1 (single-tenant, one founder —
-- see the locked plan decision). To avoid the classic Supabase footgun
-- (RLS off + default anon/authenticated grants = the whole DB readable by
-- anyone with the public anon key), every table below is explicitly
-- revoked from anon/authenticated at the end of this file. All access goes
-- through the service-role client in lib/db.ts, which is import-guarded to
-- server files only (Rules.md §1.6).

-- ── Extensions ──────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- Phase 3 cooldown similarity over briefs.angle_type
create extension if not exists vector;     -- Phase 14 content_memory embeddings

-- ── Enums ───────────────────────────────────────────────────────────────
create type platform as enum (
  'instagram', 'tiktok', 'youtube', 'x', 'linkedin',
  'threads', 'facebook', 'pinterest', 'email', 'blog'
);

create type content_status as enum (
  'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED',
  'PUBLISHED', 'FAILED', 'READY_TO_POST'
);

create type competitor_recency as enum ('clear', 'trending', 'recently_covered');

-- ── updated_at helper (attached per-table below) ───────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Content-machine tables ──────────────────────────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

create table brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  -- Phase 4: { tone, words_to_use[], words_to_avoid[], hashtag_rules, emoji_rules, cta_style }
  voice_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_brands_updated_at before update on brands
  for each row execute function set_updated_at();

create table platforms (
  id platform primary key,
  display_name text not null,
  supports_publishing boolean not null default false,
  created_at timestamptz not null default now()
);

create table platform_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  platform platform not null references platforms (id),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'broken')),
  -- Phase 11: encrypted at the application layer before insert, never plaintext (Rules.md §1.6).
  access_token_encrypted text,
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform)
);
create trigger trg_platform_connections_updated_at before update on platform_connections
  for each row execute function set_updated_at();

-- Idea-engine tables are created before `content` so content.source_brief_id can reference briefs.
-- ── Idea-engine tables ───────────────────────────────────────────────────

create table tracked_competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  name text not null,
  platform platform,
  handle_or_url text not null,
  -- RSS/Atom/API endpoint — the only sources the collector may poll (Rules.md §1.7).
  feed_url text,
  -- true when this competitor is only reachable via a platform we may not scrape.
  -- The Researcher's recency check treats it as unknown, never "clear".
  manual_only boolean not null default false,
  added_at timestamptz not null default now()
);

create table raw_signals (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_kind text not null default 'general' check (source_kind in ('general', 'competitor')),
  competitor_id uuid references tracked_competitors (id) on delete set null,
  keyword_matched text,
  title text not null,
  url text not null unique,
  raw_content text,
  engagement_score numeric,
  fetched_at timestamptz not null default now()
);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  run_id uuid not null,
  opening text not null,
  angle_type text not null,
  evidence jsonb not null default '[]'::jsonb,      -- [{source, url, excerpt}]
  competitor_recency competitor_recency not null,
  competitor_note text,
  score jsonb not null default '{}'::jsonb,          -- {novelty, relevance, proof_of_demand, effort}
  rank int,
  status text not null default 'pending' check (status in ('pending', 'promoted', 'dropped')),
  created_at timestamptz not null default now()
);

create table hooks (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs (id) on delete cascade,
  hook_text text not null,
  rationale text not null,
  status text not null default 'survivor' check (status in ('survivor', 'selected', 'rejected')),
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  agent_name text not null,
  step_order int not null,
  input jsonb not null,
  output jsonb,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'failed_validation')),
  duration_ms int,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ── Remaining content-machine tables ─────────────────────────────────────

create table content (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  -- set when this content originated from the idea engine; null for a manually pasted post.
  source_brief_id uuid references briefs (id) on delete set null,
  title text not null,
  original_content text not null,
  content_type text not null default 'text',
  original_platform platform,
  goal text,
  audience text,
  cta text,
  -- Phase 5 Content Analyzer output: { core_idea, hook, key_points[], facts_to_preserve[], visual_requirements, needs_clarification[] }
  analysis jsonb,
  status content_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_content_updated_at before update on content
  for each row execute function set_updated_at();

create table content_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content (id) on delete cascade,
  storage_path text not null,
  asset_type text not null check (asset_type in ('image', 'video')),
  -- one of 4:5, 1:1, 9:16, 16:9, 2:3 — null for the original, unformatted upload (Phase 8).
  aspect_ratio text,
  width int,
  height int,
  is_original boolean not null default false,
  created_at timestamptz not null default now()
);

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content (id) on delete cascade,
  platform platform not null,
  -- Phase 6 Platform Adapter output (one platform's shape).
  adapted_content jsonb not null default '{}'::jsonb,
  -- Phase 7 Caption Agent output: { hook, body, cta, hashtags[], first_comment }
  caption jsonb,
  -- Approval is per-platform-version, not per-idea — this is the status the /content
  -- review screen (Phase 9) actually drives through DRAFT -> ... -> PUBLISHED|READY_TO_POST.
  status content_status not null default 'DRAFT',
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform)
);
create trigger trg_content_versions_updated_at before update on content_versions
  for each row execute function set_updated_at();

create table scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references content_versions (id) on delete cascade,
  platform_connection_id uuid references platform_connections (id) on delete set null,
  scheduled_for timestamptz not null,
  -- Rules.md §3 duplicate-post protection — checked before every publish attempt.
  idempotency_key text not null unique,
  status content_status not null default 'SCHEDULED',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_scheduled_posts_updated_at before update on scheduled_posts
  for each row execute function set_updated_at();

create table published_posts (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid references scheduled_posts (id) on delete set null,
  content_version_id uuid not null references content_versions (id) on delete cascade,
  platform platform not null,
  -- id returned by the platform's API; null for a manual READY_TO_POST export.
  platform_post_id text,
  published_at timestamptz,
  -- PUBLISHED or READY_TO_POST only — a row here must never claim PUBLISHED
  -- unless a platform API actually confirmed it (Rules.md §1.3).
  status content_status not null default 'READY_TO_POST'
    check (status in ('PUBLISHED', 'READY_TO_POST', 'FAILED')),
  created_at timestamptz not null default now()
);

create table analytics (
  id uuid primary key default gen_random_uuid(),
  published_post_id uuid not null references published_posts (id) on delete cascade,
  -- Every metric nullable: store null for anything a platform doesn't expose, never guess.
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  fetched_at timestamptz not null default now()
);

create table performance_reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  run_id uuid not null,
  observed jsonb not null,        -- { top_performers[], low_performers[], patterns[] }
  interpretation jsonb not null,  -- { possible_reasons[], confidence } — kept structurally separate from `observed`
  recommendations jsonb not null default '[]'::jsonb,
  next_test text,
  created_at timestamptz not null default now()
);

create table content_memory (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  content_id uuid references content (id) on delete set null,
  topic_summary text not null,
  angle_type text,
  -- Dimension must match GEMINI_EMBEDDING_MODEL's output_dimensionality (Phase 14) — verify at build time.
  embedding vector(768),
  performance_score numeric,
  created_at timestamptz not null default now()
);

create table system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  source text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────
create index idx_raw_signals_fetched_at on raw_signals (fetched_at desc);
create index idx_raw_signals_source_kind on raw_signals (source_kind);
create index idx_briefs_created_at_status on briefs (created_at desc, status);
create index idx_briefs_brand on briefs (brand_id);
create index idx_briefs_angle_type_trgm on briefs using gin (angle_type gin_trgm_ops); -- Phase 3 cooldown check
create index idx_hooks_brief on hooks (brief_id);
create index idx_agent_runs_run_step on agent_runs (run_id, step_order);
create index idx_content_brand_status on content (brand_id, status);
create index idx_content_assets_content on content_assets (content_id);
create index idx_content_versions_content_platform on content_versions (content_id, platform);
create index idx_scheduled_posts_scheduled_for on scheduled_posts (scheduled_for);
create index idx_published_posts_content_version on published_posts (content_version_id);
create index idx_analytics_published_post on analytics (published_post_id);
create index idx_tracked_competitors_brand on tracked_competitors (brand_id);
create index idx_content_memory_embedding on content_memory using hnsw (embedding vector_cosine_ops);

-- ── Access lockdown (RLS is off — see header note) ───────────────────────
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
