# PRD — Project Requirements Document

## In plain English

We are building one app with two halves that work together:

1. **The Idea Engine** — finds good content ideas on its own, every day, without you having to think of them.
2. **The Content Machine** — takes one approved idea and turns it into a ready-to-post version for every platform (Instagram, TikTok, LinkedIn, X, YouTube Shorts, Threads, Facebook, Pinterest, Email, Blog) — all in your brand's voice, sized correctly, captioned correctly — and holds it for your final approval before anything goes live.

You paste in nothing. You approve, you don't write.

---

## 1. What we're building

**Product:** A subscription-based SaaS app (the thing being marketed).
**This project:** The internal content system that markets *that* SaaS app — not the SaaS app itself.
**Stage:** Pre-launch / building-in-public. There is no customer data, no reviews, no support tickets yet — the system has to find ideas from the outside world and from the founder's own build process.

## 2. Who this is for

- **Primary user:** The founder (you). One person, wearing the "creator," "editor," and "final approver" hats at once.
- **Audience the content is aimed at:** Other founders, builders, and early adopters interested in SaaS/building-in-public content — people who might become early users or word-of-mouth spreaders of the product.

## 3. The problem this solves

Right now, the bottleneck is **coming up with ideas and hooks** — not writing, not designing, not scheduling. Everything downstream of "what should I post about" is comparatively easy to automate; the idea itself is the hard part. This system exists to solve that specific bottleneck first, then carry the idea all the way through to a finished, platform-ready post.

## 4. Core principle: the one-job rule

No single AI agent tries to do everything. Every agent has exactly one job, reads from one fixed input, and writes to one fixed output. Agents never call each other directly — they hand off work through shared storage (database tables or markdown files), the same way a real team would hand off through a shared doc rather than shouting across the room. This means:

- Any single agent can be improved, replaced, or debugged without breaking the others.
- You can see exactly what each agent produced, at every step.
- Adding a new platform or a new idea source later means adding one new piece, not rewriting the system.

## 5. The two halves, in plain terms

### Half A — Idea Engine (solves the bottleneck)
Runs on its own schedule. Continuously watches free sources (Hacker News, Reddit, RSS feeds, Google Alerts, the founder's own build notes, etc.), and once a day turns what it found into a small number of genuinely good, non-repeated content ideas with a strong hook already attached.

### Half B — Content Machine (turns one idea into ten platform-ready posts)
Takes one finished idea, understands its core meaning and facts, and rewrites it — properly, not copy-pasted — for every platform you use, in the correct format, length, and tone for that platform, with a caption and correctly-sized media for each. Nothing gets published without you looking at it first.

## 6. Features

### Must have (v1)
- Daily automatic idea generation with sourced, ranked, non-repeated topics
- Competitor-recency check on every idea — flags whether a tracked competitor or adjacent creator
  has posted a near-identical angle in the last 7-14 days, so the system never unknowingly repeats
  something already circulating, and can lean into an angle deliberately when it's genuinely trending
- Hook generation (10 drafted, 3 survivors, with reasoning) for each idea
- One-click hand-off from idea to content generation
- Content ingestion accepting text/idea input
- Content analyzer that extracts the core idea + facts once, so meaning never drifts across platforms
- Brand voice profile (tone, words to use/avoid, hashtag rules, emoji rules) applied consistently
- Platform adapters for at least: Instagram, TikTok/Shorts, X, LinkedIn (expand to the rest after these are solid)
- Caption engine per platform
- Human approval screen — nothing publishes without explicit approval
- Basic content calendar (today/week/month view)
- Manual "ready to post" export for platforms without publishing APIs

### Should have (v2)
- Automatic publishing for platforms with available APIs
- Analytics import (whatever each platform exposes)
- Content memory + similarity search, so repeated topics are caught automatically
- Performance-informed idea suggestions (feedback loop from analytics back to the idea engine)
- Media resize/reformat engine with intelligent cropping

### Could have (later)
- Video repurposing (long video → short clips)
- Additional platforms (Threads, Facebook, Pinterest, Email, Blog)
- Multiple brand profiles (if this system is ever offered to other creators)

### Won't have (explicitly out of scope for now)
- Fully unattended auto-publishing with no human review (safety default stays OFF)
- Scraping platforms with no public API or where scraping violates terms of service (e.g. app store reviews, G2) — these stay manual
- Retraining or fine-tuning any AI model — "learning" happens by feeding performance history back into future prompts, not by changing the model itself

## 7. Success criteria

- The founder receives 3 ranked, sourced, hook-ready ideas every day without manually searching for them
- Going from "approved idea" to "ready-to-post content for 4+ platforms" takes minutes, not hours
- No content ever publishes without a human looking at it first
- The same topic/angle is never repeated without it being a deliberate choice
