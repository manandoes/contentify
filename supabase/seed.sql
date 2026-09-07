-- Local-dev seed data (Phases.md Phase 1 "Done when" + Phase 3/4 prerequisites).
-- Re-applied on every `supabase db reset`. Idempotent via ON CONFLICT / NOT EXISTS
-- guards so it's also safe to run by hand against a live database.
--
-- The founder's real email replaces 'founder@example.com' before production use —
-- it must match ALLOWED_FOUNDER_EMAIL in .env.

insert into users (email, display_name)
values ('founder@example.com', 'Founder')
on conflict (email) do nothing;

insert into brands (user_id, name, voice_profile)
select u.id, 'Contentify', '{}'::jsonb
from users u
where u.email = 'founder@example.com'
  and not exists (select 1 from brands b where b.user_id = u.id);

insert into platforms (id, display_name, supports_publishing) values
  ('instagram', 'Instagram',      true),
  ('tiktok',    'TikTok/Shorts',  true),
  ('youtube',   'YouTube Shorts', true),
  ('x',         'X',              true),
  ('linkedin',  'LinkedIn',       true),
  ('threads',   'Threads',        false),
  ('facebook',  'Facebook',       true),
  ('pinterest', 'Pinterest',      true),
  ('email',     'Email',          false),
  ('blog',      'Blog',           false)
on conflict (id) do nothing;
