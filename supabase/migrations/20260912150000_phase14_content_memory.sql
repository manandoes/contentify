-- Phase 14 — Content memory + feedback loop (Phases.md Phase 14,
-- Implementationplan.md Block F: "embed published posts into content_memory
-- (pgvector) ... repoint the Researcher's cooldown to vector similarity").
--
-- Three additions:
--
-- 1. briefs.performance_note — the Researcher's new output field citing
--    what content_memory says about a semantically similar past topic (or
--    null when none was supplied/found). Free text, same treatment as the
--    existing competitor_note column.
--
-- 2. A unique index on content_memory.content_id so services/contentMemory.ts
--    can upsert one memory row per piece of content (re-syncing updates
--    performance_score and embedding in place instead of duplicating rows).
--    Partial (`where content_id is not null`) because the column is
--    nullable — a future manually-seeded memory row without a content_id
--    should not collide with another.
--
-- 3. match_content_memory() — the nearest-neighbour query the Phase 1
--    migration's hnsw index on content_memory.embedding was built for.
--    Kept as a SQL function (rather than reimplementing cosine distance in
--    application code) because the index only accelerates an in-database
--    `<=>` query. Same access model as every table here: no grants to
--    anon/authenticated, service-role only (Rules.md §1.6).

alter table briefs
  add column if not exists performance_note text;

create unique index if not exists uq_content_memory_content_id
  on content_memory (content_id)
  where content_id is not null;

create or replace function match_content_memory(
  query_embedding vector(768),
  match_brand_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  content_id uuid,
  topic_summary text,
  angle_type text,
  performance_score numeric,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    content_memory.id,
    content_memory.content_id,
    content_memory.topic_summary,
    content_memory.angle_type,
    content_memory.performance_score,
    1 - (content_memory.embedding <=> query_embedding) as similarity
  from content_memory
  where content_memory.brand_id = match_brand_id
    and content_memory.embedding is not null
  order by content_memory.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;

revoke all on function match_content_memory(vector, uuid, int) from anon, authenticated;
