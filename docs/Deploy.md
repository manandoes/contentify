# Deploy.md — Phase 17 go-live checklist

## In plain English

Everything up through Phase 16 has been built and tested on your machine. This is the one
phase nobody can automate for you: deploying the real app, and personally clicking
"Approve," "Schedule," and "Publish" on one real piece of content, for real. This checklist
is the script to follow while you do that.

**Done when:** you've personally approved and published (or exported) one real piece of
content through the whole pipeline, in production.

---

## 1. Set production environment variables

In your Vercel project → Settings → Environment Variables, set every variable listed in
`.env.example`. Pay special attention to these two — they are the whole point of this phase:

```
AUTO_PUBLISH=false
HUMAN_APPROVAL_REQUIRED=true
```

`lib/config.ts` refuses to boot if `AUTO_PUBLISH=true` while `HUMAN_APPROVAL_REQUIRED=true`
at the same time (that combination is contradictory), but it cannot stop you from setting
`AUTO_PUBLISH=true` on its own — that's a real, supported mode, just not the safe default.
If you only ever want to publish by clicking a button yourself, leave both exactly as shown
above.

Use a freshly generated `CRON_SECRET` and `TOKEN_ENCRYPTION_KEY` for production — don't reuse
your local `.env.local` values (see comments in `.env.example` for the generation commands).

## 2. Set GitHub Actions secrets

The six workflows in `.github/workflows/` call your deployed API routes, not your local
machine. In your GitHub repo → Settings → Secrets and variables → Actions, set:

- `APP_URL` — your production URL (e.g. `https://your-app.vercel.app`)
- `CRON_SECRET` — the exact same value you set in Vercel

Without these, every workflow run fails at the `curl` step with a 401.

## 3. Deploy and confirm it boots

Deploy to Vercel. Open the deployed URL and sign in. If `lib/config.ts` finds a missing or
contradictory variable, every page will 500 — that's the safety net working, not a bug to
route around. Fix the variable in Vercel and redeploy.

## 4. Confirm the safety gate, in the app itself

Go to `/settings`. The **Publishing safety** card reads `AUTO_PUBLISH` and
`HUMAN_APPROVAL_REQUIRED` directly from this deployment and shows both badges. Confirm they
read **Auto-publish: OFF** and **Human approval required: ON** — or, if you deliberately chose
the fully-automated mode, confirm that's what you meant to deploy.

## 5. Connect one real platform

Still on `/settings`, click **Connect** under Connected platforms for LinkedIn (or Instagram)
and complete the real OAuth flow with your real account. Confirm it shows **Connected**.

Every other platform has no publishing API — that's expected, not a gap. Content for those
platforms is reviewed and exported by hand (step 8).

## 6. Run one real idea through the engine

On `/ideas`, trigger a real run (or wait for the daily 13:00 UTC cron). Confirm three ranked
ideas land with sources and a competitor-recency badge on each.

## 7. Turn one idea into a draft

Pick one idea, ingest it, and let the Content Analyzer → Platform Adapter → Caption Agent
pipeline run. On `/content`, confirm you see a real, platform-native draft — not the same text
copy-pasted across platforms.

## 8. Approve, schedule, and publish — for real

On `/content`:

1. **Approve** the draft you're happy with.
2. **Schedule** it (pick a time a few minutes out, so you don't have to wait long).
3. Either wait for `.github/workflows/publish.yml`'s 15-minute pass, or click **Publish now**
   to run the exact same `services/publisher.ts` path immediately.

If the platform you connected supports publishing, confirm it goes `PUBLISHED` and the real
post appears on the real platform. If you picked a platform with no publishing API instead,
confirm it goes `READY_TO_POST` and `/api/content/[versionId]/export` gives you a correct,
ready-to-paste manual pack — publishing it by hand still counts as finishing the pipeline.

## 9. Confirm the loop closes

Check `/pipeline` for the run you just watched happen, and `/analytics` once the platform has
had time to report metrics (`.github/workflows/analytics.yml` polls every 6 hours). Neither is
required to call Phase 17 done, but seeing them populate is the real proof the whole system —
not just each phase in isolation — works end to end.

---

Once step 8 has happened for real, once, Phase 17 — and the build — is done.
