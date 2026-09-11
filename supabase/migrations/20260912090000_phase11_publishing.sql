-- Phase 11 — First platform connector (Phases.md Phase 11, Implementationplan.md Block E).
--
-- Two additions the Phase 1 schema left open, both needed the moment a real
-- platform API is on the other end of a publish:
--
-- 1. platform_connections.platform_account_id — the account the stored token
--    actually acts as (LinkedIn: urn:li:person:{sub} from /v2/userinfo).
--    Captured once at connection time so publishing never has to re-derive
--    who it is posting as, and so a re-auth against a *different* account is
--    visible rather than silent.
--
-- 2. A unique index making Rules.md §3's duplicate-post protection a database
--    invariant instead of a hope. services/publisher.ts checks published_posts
--    before every attempt; this index is what makes two concurrent attempts
--    (a cron pass and a "Publish now" click landing together) impossible to
--    both succeed. One scheduled post can only ever record one outcome.

alter table platform_connections
  add column if not exists platform_account_id text;

create unique index if not exists uq_published_posts_scheduled_post
  on published_posts (scheduled_post_id)
  where scheduled_post_id is not null;
