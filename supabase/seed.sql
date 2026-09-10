-- Local-dev seed data (Phases.md Phase 1 "Done when" + Phase 3/4 prerequisites).
-- Re-applied on every `supabase db reset`. Idempotent via ON CONFLICT / NOT EXISTS
-- guards so it's also safe to run by hand against a live database.
--
-- The founder's real email replaces 'founder@example.com' before production use —
-- it must match ALLOWED_FOUNDER_EMAIL in .env.

insert into users (email, display_name)
values ('founder@example.com', 'Founder')
on conflict (email) do nothing;

-- Phase 4 starter voice profile — edit for real via /settings, which is the
-- single write path (services/brandVoice.ts validates against
-- types/brandVoice.ts's schema either way). This is a reasonable
-- build-in-public-founder default, not the founder's actual voice.
insert into brands (user_id, name, voice_profile)
select u.id, 'Contentify', jsonb_build_object(
  'tone', 'Direct and a little irreverent. Talk like a founder sharing real progress, not a brand issuing announcements. Short sentences. No corporate-speak.',
  'words_to_use', jsonb_build_array('shipped', 'built', 'learned', 'build in public'),
  'words_to_avoid', jsonb_build_array('synergy', 'revolutionary', 'game-changing', 'disrupt', 'seamless'),
  'hashtag_rules', jsonb_build_object(
    'max_count', 3,
    'always_include', jsonb_build_array('#buildinpublic'),
    'placement', 'end'
  ),
  'emoji_rules', jsonb_build_object('allowed', false, 'max_count', 0),
  'cta_style', 'One clear ask per post, stated plainly. No fake urgency. It is fine to have no CTA at all.'
)
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

-- Phase 3 prerequisite: tracked_competitors seed. These four are real,
-- verified-live placeholders (well-known tools/creators in the
-- social-scheduling / build-in-public content space) so the Researcher's
-- competitor-recency check has something to run against out of the box —
-- same spirit as services/collector/generalFeeds.ts. Swap these for the
-- founder's actual direct competitors and adjacent creators before
-- production use. Every feed_url below was curl-verified to resolve to a
-- real RSS/Atom feed (200, XML content-type), never scraped (Rules.md §1.7).
insert into tracked_competitors (brand_id, name, handle_or_url, feed_url, manual_only)
select b.id, c.name, c.handle_or_url, c.feed_url, false
from brands b
cross join (
  values
    ('Buffer',              'https://buffer.com',                 'https://buffer.com/resources/rss/'),
    ('Typefully',           'https://typefully.com',               'https://typefully.com/blog/rss.xml'),
    ('Publer',               'https://publer.io',                   'https://publer.io/blog/feed/'),
    ('Lenny''s Newsletter', 'https://www.lennysnewsletter.com',    'https://www.lennysnewsletter.com/feed')
) as c(name, handle_or_url, feed_url)
where b.name = 'Contentify'
  and not exists (
    select 1 from tracked_competitors tc where tc.brand_id = b.id and tc.name = c.name
  );
