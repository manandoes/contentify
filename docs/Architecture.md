# Architecture.md

## In plain English

Think of this app as an assembly line with two sections:

**Section 1 — the idea factory.** Raw material (things happening on the internet) comes in constantly. Once a day, a worker sorts through it, picks the best 3 pieces, and hands them to a second worker who writes catchy openers for them. A third worker packages the winner into a clean, ready-to-use idea.

**Section 2 — the content factory.** That one clean idea goes in one end, and ten different platform-ready posts come out the other end — each shaped correctly for where it's going (Instagram, TikTok, LinkedIn, etc.) — but nothing leaves the building until you've signed off on it.

Every worker in both factories does exactly one job and passes their work forward on a shared clipboard (a database table or a file) — no worker talks directly to another worker.

---

## 1. High-level flow

```
CONTINUOUS (all day)
Free sources (HN, Reddit, RSS, Alerts, build notes)
        ↓
Collector worker (polls every 15-30 min)
        ↓
raw_signals table

SCHEDULED (daily, or a few times a day)
raw_signals
        ↓
Researcher agent  → writes → briefs.md / briefs table
        ↓
Hook-writer agent → writes → hooks.md / hooks table
        ↓
Idea-finalizer agent → writes → one ingestion-ready object
        ↓
─────────────────────────────────────────────
CONTENT INGESTION
        ↓
Content Analyzer  (extracts core_idea, facts_to_preserve — never rewrites)
        ↓
AI Content Engine → Platform Adapters (Instagram, TikTok, YouTube, X,
                     LinkedIn, Threads, Facebook, Pinterest, Email, Blog)
        ↓
Format / Asset Engine (resize, crop, safe zones per platform)
        ↓
Caption Engine (hook → body → CTA → hashtags, per platform)
        ↓
HUMAN APPROVAL  ← the only mandatory gate before anything goes out
        ↓
Scheduler / Publisher (publishes where the API allows, otherwise
                        marks READY_TO_POST)
        ↓
Analytics (pulls whatever each platform actually exposes)
        ↓
Content Memory (stores idea, hook, format, CTA, performance score)
        ↓
Performance Agent → turns history into recommendations
        ↓
↺ feeds back into the Researcher agent for tomorrow's ideas
```

## 2. The one-job rule, applied to every agent

Every agent below has exactly one input source and one output destination. None of them call each other as functions — a lightweight **orchestrator** script runs them in sequence and logs each step.

| Agent | Reads only | Writes only | Never does |
|---|---|---|---|
| Collector | free source APIs/feeds | `raw_signals` table | Never scores, ranks, or writes ideas |
| Researcher | `raw_signals` + cooldown log + competitor/adjacent-creator posts (last 7-14 days) | `briefs.md` / `briefs` table (each opening tagged `competitor_recency`) | Never writes hooks or captions |
| Hook-writer | `briefs.md` | `hooks.md` / `hooks` table | Never sources topics or finalizes the post |
| Idea-finalizer | `hooks.md` | one ingestion-ready JSON object | Never invents facts not in the brief |
| Content Analyzer | the ingestion object | `analysis` JSON (core_idea, facts_to_preserve, etc.) | Never rewrites or improves content |
| Platform Adapters | analysis + brand voice + platform rules | one JSON object per platform | Never copy-pastes between platforms |
| Format Engine | media + target aspect ratio | resized/cropped assets | Never stretches media |
| Caption Engine | platform + adapted content + brand voice | `{hook, body, cta, hashtags, first_comment}` | Never invents a CTA if none exists |
| Performance Agent | historical posts + metrics | `performance_reports` | Never claims causation, never guesses missing data |

## 3. Tech stack

- **Claude Code** — builds and maintains the app
- **Google Gemini API** — content analysis, adaptation, idea generation (all 7 agents, via `lib/gemini.ts`)
- **Next.js + TypeScript** — dashboard and app logic
- **Supabase / PostgreSQL** — database (content, versions, analytics, memory, raw signals, briefs, hooks)
- **Vercel** — hosting
- **GitHub Actions** — scheduled cron (the daily/continuous triggers hit API routes via a shared secret; Vercel Hobby's cron is capped at once/day, so scheduling lives here instead)
- **Cloud storage (Supabase Storage / S3)** — media assets
- **Platform APIs** — publishing/analytics, only where officially supported
- **Optional:** Buffer/Later/Metricool for platforms without direct publishing APIs; n8n only if you later need a purely visual trigger/notification layer — core logic stays in this repo

## 4. Folder / file structure (plain language first)

```
/app                        → everything the user sees and clicks
  /dashboard                 - the home screen with stats
  /create                    - "drop in one idea, generate everywhere"
  /ideas                     - review today's researched ideas/hooks
  /content                   - library of generated posts + versions
  /calendar                  - today / week / month view
  /pipeline                  - see every agent's run, step by step
  /analytics                 - performance numbers
  /settings                  - brand voice, connected platforms, approval mode

/api                         → the server logic behind each screen
  /ideas
    /collect                  - runs the 24/7 collector
    /research                 - runs the Researcher agent
    /hooks                    - runs the Hook-writer agent
    /finalize                 - runs the Idea-finalizer agent
  /content
    /ingest                   - accepts a finalized idea
    /generate                  - runs analyzer + platform adapters
  /publish                    - scheduler + connectors
  /analytics                  - metric fetching

/agents                      → the actual agent prompts/logic, one file per agent
  researcher.md
  hookWriter.md
  ideaFinalizer.md
  contentAnalyzer.md
  platformAdapter.md
  captionAgent.md
  performanceAgent.md

/connectors                  → one folder per platform, all with the same shape
  /instagram  /tiktok  /youtube  /x
  /linkedin   /threads /facebook /pinterest

/services                    → shared plumbing
  scheduler.ts  media.ts  analytics.ts  memory.ts

/lib                         → database access, auth, validation
/types                       → shared TypeScript types
/tests                       → automated tests

/docs                        → this file and its companions
  PRD.md  Architecture.md  Rules.md  Phases.md  Design.md  Memory.md
```

## 5. Database (plain language: these are the filing cabinets)

Two groups of tables — the idea-engine's own tables, and the content-machine's tables (from the build guide).

**Idea engine tables**
```
raw_signals(id, source, keyword_matched, title, url, raw_content,
            engagement_score, fetched_at)
tracked_competitors(id, name, platform, handle_or_url, added_at)
briefs(id, opening, angle_type, evidence[], competitor_recency,
       competitor_note, score, status, created_at)
hooks(id, brief_id, hook_text, rationale, status, created_at)
agent_runs(id, run_id, agent_name, step_order, input jsonb,
           output jsonb, status, duration_ms, started_at, finished_at)
```

`tracked_competitors` is a short manually-maintained list (direct competitors + adjacent creators)
the Researcher checks against every run — this is what powers the competitor-recency check: has
anyone on this list posted a near-identical angle in the last 7-14 days? `briefs.competitor_recency`
stores the result (`clear` / `trending` / `recently_covered`) so the Hook-writer can react to it
without re-running the check itself.

**Content machine tables** (as specified in the build guide)
```
users, brands, content, content_assets, content_versions,
platforms, platform_connections, scheduled_posts, published_posts,
analytics, performance_reports, content_memory, system_logs
```

Every table has an id, timestamps, and foreign keys pointing to the table it belongs to — e.g. a `content` row belongs to a `brand`, and a `content_versions` row belongs to a `content` row and a specific platform.

## 6. Every platform connector shares one shape

```
validateConnection()   // are the credentials valid?
publish(content)        // publish, or return NOT_SUPPORTED
getStatus(postId)       // live / failed / pending
getAnalytics(postId)    // whatever metrics that platform exposes
```

This means the rest of the app never needs to know which platform it's talking to. Adding a platform later is one new folder; a platform changing its API is one folder to fix.
