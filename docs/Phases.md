# Phases.md

## In plain English

AI can't build this whole system in one go without losing track of itself — so we build it in small, testable chunks, in an order where each phase actually works on its own before the next one starts. Don't skip ahead. Finish and test a phase before starting the next one.

---

## Phase 0 — Project skeleton
**Goal:** An empty but running app.
- Initialize Next.js + TypeScript project
- Set up `.env.example` and `.gitignore` (secrets never committed)
- Set up Supabase/PostgreSQL connection
- Deploy a "hello world" version to Vercel
**Done when:** the app loads in a browser and connects to the database.

## Phase 1 — Database + core tables
**Goal:** All filing cabinets exist, even if empty.
- Create all tables from Architecture.md (both idea-engine and content-machine tables)
- Add indexes and foreign keys as specified
**Done when:** you can manually insert and read a test row in every table.

## Phase 2 — Continuous collector
**Goal:** Raw signals start flowing in automatically.
- Build the collector worker (HN, Reddit, RSS, Google Alerts to start — expand later)
- Schedule it to poll every 15-30 minutes via Vercel Cron
- Write results into `raw_signals`
**Done when:** `raw_signals` fills up on its own, unattended, for a full day.

## Phase 3 — Idea engine agents
**Goal:** A finished, ready-to-ingest idea comes out the other end, daily.
- Seed `tracked_competitors` with a short manual list of direct competitors + adjacent creators
- Build the Researcher agent (reads `raw_signals` + `tracked_competitors`, writes `briefs` — each
  opening tagged with a `competitor_recency` check: clear / trending / recently_covered)
- Build the Hook-writer agent (reads `briefs`, writes `hooks` — reacting to the `competitor_recency`
  flag per the rules in Rules.md, never producing a hook that reads as a copy of a specific
  recently-covered post)
- Build the Idea-finalizer agent (reads `hooks`, writes one ingestion-ready object)
- Build the orchestrator that runs these three in sequence and logs each step to `agent_runs`
- Build a simple `/ideas` screen to review today's output, showing the competitor-recency flag
  next to each opening so you can see why something was dropped or reframed
**Done when:** you can trigger a daily run and see 3 ranked, sourced ideas with hooks land in the
dashboard, and confirm at least one test case where a stale, recently-covered angle is correctly
dropped or reframed rather than promoted unchanged.

## Phase 4 — Brand voice
**Goal:** Every future generated post sounds like you, not like generic AI output.
- Build the brand profile schema and settings screen
- Seed it with your actual tone, words to use/avoid, hashtag rules, CTA style
**Done when:** the profile is saved and retrievable by other agents.

## Phase 5 — Content ingestion + analyzer
**Goal:** One finished idea becomes one structured "source of truth."
- Build the ingestion API accepting the idea-finalizer's output (or a manually pasted post)
- Build the Content Analyzer agent using the exact prompt in Rules.md
**Done when:** pasting in a post produces a correct `core_idea` + `facts_to_preserve` breakdown every time.

## Phase 6 — Platform adapters (start with 2, not 10)
**Goal:** One idea becomes genuinely different, platform-native drafts.
- Build the Master Adaptation Agent using the exact prompt in Rules.md
- Start with Instagram and LinkedIn only
**Done when:** the same idea produces two visibly different, correctly-toned drafts.

## Phase 7 — Caption engine
**Goal:** Every draft has a real, platform-correct caption.
- Build the Caption Agent using the exact prompt in Rules.md
**Done when:** captions follow each platform's structure (hook → value → CTA → hashtags, etc.)

## Phase 8 — Media formatting
**Goal:** Nothing gets stretched or cropped badly.
- Build the resize/crop engine for 4:5, 1:1, 9:16, 16:9, 2:3
- Add safe-zone checks
**Done when:** one uploaded image produces correctly-cropped versions for every target ratio.

## Phase 9 — Human approval dashboard
**Goal:** Nothing publishes without you seeing it first.
- Build the approval screen with statuses: DRAFT, READY_FOR_REVIEW, APPROVED, SCHEDULED, PUBLISHED, FAILED, READY_TO_POST
- Build Edit / Approve / Reject / Regenerate actions
**Done when:** you can review and approve a real generated draft end to end.

## Phase 10 — Calendar
**Goal:** See everything in one place.
- Build today/week/month calendar views
**Done when:** approved and scheduled content shows up correctly by date.

## Phase 11 — First platform connector
**Goal:** Prove real publishing works, once, before scaling to more.
- Pick one platform with a straightforward API
- Build its connector with the shared interface (`validateConnection`, `publish`, `getStatus`, `getAnalytics`)
- Learn OAuth properly on this one before repeating it elsewhere
**Done when:** a real test post publishes successfully to a sandbox/test account.

## Phase 12 — Remaining platform connectors
**Goal:** Expand coverage using the same pattern.
- Add connectors one at a time, same interface each time
- For platforms without a publishing API, confirm they correctly fall back to `READY_TO_POST`
**Done when:** every intended platform either publishes or produces a clean manual pack.

## Phase 13 — Analytics
**Goal:** Know what happened after publishing.
- Build analytics fetching per platform, handling missing metrics gracefully (store null, never guess)
**Done when:** real metrics appear against real published posts.

## Phase 14 — Content memory + feedback loop
**Goal:** The system gets smarter about what to suggest next, using real history.
- Build content memory with similarity search
- Build the Performance Agent using the exact prompt in Rules.md
- Connect the Researcher agent to also read from `content_memory`, not just its own cooldown log
**Done when:** a new idea run visibly avoids repeating a recent topic and cites past performance in its reasoning.

## Phase 15 — Full pipeline visibility
**Goal:** You can see what every agent did, at every step, without digging through logs manually.
- Build the `/pipeline` view reading from `agent_runs`
**Done when:** you can open any day's run and see each agent's input/output in order.

## Phase 16 — Test everything, especially failure paths
**Goal:** Confidence before going live.
- Deliberately expire a token, send bad media, force a timeout mid-publish
- Confirm duplicate-post protection actually works
**Done when:** every row in the testing checklist (see build guide §28) passes.

## Phase 17 — Deploy with approval mode ON
**Goal:** Ship it, safely.
- Confirm `AUTO_PUBLISH=false` and `HUMAN_APPROVAL_REQUIRED=true` in production
- Run one real post through the entire system end to end
**Done when:** you've personally approved and published (or exported) one real piece of content through the whole pipeline.
