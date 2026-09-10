-- Phase 8 — Media formatting (Phases.md, Implementationplan.md Block D).
--
-- Storage for the original upload + the 5 formatted crops per content_assets
-- row. Private bucket: same access model as every table in the Phase 1
-- migration — all access goes through the service-role client
-- (lib/db.ts), never a public URL or anon/authenticated grant.
insert into storage.buckets (id, name, public)
values ('content-assets', 'content-assets', false)
on conflict (id) do nothing;
