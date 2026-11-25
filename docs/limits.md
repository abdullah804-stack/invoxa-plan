# Free-tier limits

Checked on **21 November 2026** against official documentation. The build plan warned that
its own numbers came from memory; these were verified. Re-check on the day each account is
created and again in week 15 before estimating capacity.

Invoxa must stay free to run. A feature that needs a paid service does not ship.

## MongoDB Atlas (free cluster, formerly M0)

- **512 MB** maximum storage, **including indexes**.
- Shared RAM, not configurable. **500** concurrent connections.
- Pauses after **30 days** with no activity; a paused cluster must be resumed.
- Sources: [Free cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations),
  [pause and resume](https://www.mongodb.com/docs/atlas/pause-terminate-cluster).

**What this means for Invoxa:** logos and signatures are stored once in `brandAssets` and
referenced by SHA-256 hash, never copied onto a document. The activity log is capped per
business. Receipt photos never reach the server. Storage planning must assume that indexes
and the 512 MB ceiling grow together.

## Google AI Studio / Gemini API (free tier)

- Free input/output is available for these model IDs:
  `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-3-flash-preview`,
  `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`.
- **Rate limits (RPM/RPD) are per model, per project and per usage tier and are not a single
  public number.** Read the active project's limits in AI Studio; Google documents that they
  change. Invoxa therefore enforces its own cap (5 per minute, 30 per day per user) below
  whatever Google allows.
- **Free-tier prompts may be used to improve Google's products.** This is why the app shows a
  one-time notice before the first prompt and never sends addresses, emails or invoices.
- Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
  [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## Expo (EAS Build free)

- **15 Android builds/month** and 15 iOS builds/month on the free plan, on a **low-priority
  queue**; peak waits can reach 90+ minutes. The documented cap is **50 pending builds** per
  platform per account.
- **Expo Go cannot run on-device speech recognition**; it needs a development build.
  Local notifications do work in Expo Go, but the dev build is still required from week 4.
- Source: [Expo pricing](https://expo.dev/pricing),
  [build limitations](https://docs.expo.dev/build-reference/limitations).

**What this means for Invoxa:** build count, not build minutes, is the constraint. Make the
development build in week 4 and reuse it; do not spend builds on cosmetic changes.

## API host (Render free web service)

- **512 MB RAM**, 0.1 CPU.
- Spins down after **15 minutes** without inbound traffic and needs about a minute to wake.
- **750 instance-hours per workspace per month**, shared across free services.
- Sources: [instance types](https://render.com/docs/compute-plans),
  [free service limits](https://render.com/docs/free).

**What this means for Invoxa:** the app shows "Waking the server" and retries a backup part. A
keep-warm ping is optional and not free in practice: a 10-minute GitHub Actions cron is about
4,320 runs a month, billed at a minute each, which exceeds the free Actions allowance; an external
5-minute monitor keeps the service awake but spends about 720 of the 750 free instance-hours. Cold
starts are a product concern, not just an ops detail. The trade-off is written up in
`docs/release.md`.

## Static host for the Expo web export (Netlify free)

- Current free plan is credit-based: **300 credits/month**; bandwidth costs **20 credits/GB**,
  so a bandwidth-only ceiling of about **15 GB**. Older accounts (before 4 September 2025) are
  on the legacy plan with **100 GB/month**.
- The Free plan permits **commercial projects** (Vercel's free plan is non-commercial, so it is
  not used for a real product).
- Sources: [credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans),
  [Netlify Free plan announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/).

## GitHub Actions (private repository, GitHub Free)

- **$12/month** of included compute; at the standard Linux 2-core rate of **$0.006/minute**
  that is about **2,000 minutes/month** if spent only on Linux runners. Minutes round up.
- Scheduled workflows count like any other run, and **cron runs can be delayed** at peak load;
  queued runs may be dropped.
- Sources: [included usage](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
  [runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing),
  [schedule events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

**What this means for Invoxa:** CI runs lint, typecheck, test, audit and gitleaks on every push.
Keep the pipeline short. The daily recurring job must be idempotent because a delayed or
dropped cron run is normal, and `POST /recurring/run` is also called on app open.

## Capacity: how many businesses fit in 512 MB

Measured on **25 November 2026** against a local database, with `Buffer.byteLength` on stored
records (a close proxy for BSON; indexes are not included in that figure):

- one issued invoice with 5 lines, a client snapshot, totals and a brand snapshot: **≈ 1,663 bytes**
- one expense with vendor and tax: **≈ 362 bytes**

Assume one active small business for one year:

| Records                                    | Count | Size         |
| ------------------------------------------ | ----- | ------------ |
| issued invoices (1.7 KB each)              | 250   | ≈ 425 KB     |
| expenses (0.36 KB each)                    | 300   | ≈ 108 KB     |
| time entries (0.3 KB each)                 | 400   | ≈ 120 KB     |
| clients (0.25 KB each)                     | 80    | ≈ 20 KB      |
| projects (0.4 KB each)                     | 20    | ≈ 8 KB       |
| recurring schedules (0.6 KB each)          | 24    | ≈ 15 KB      |
| activity log (capped at 250, 0.25 KB each) | 250   | ≈ 63 KB      |
| profile, logo and signature (stored once)  | 1     | ≈ 60 KB      |
| **records per business-year**              |       | **≈ 0.8 MB** |

Indexes roughly double the footprint of small documents (the document collection alone carries five
indexes), so budget **≈ 1.5–1.6 MB per business-year** of records. With 25% headroom left for
operations and growth, 512 MB holds roughly:

- **≈ 250–300 businesses** keeping one year of records, or
- **≈ 120–150 businesses** keeping two years, or fewer if every logo is near its 300 KB cap.

The 512 MB ceiling is data plus indexes; a free cluster is also limited to about 100 operations per
second and 500 connections, which will bind sooner than storage once a few hundred users are
active. The plan's mitigations still hold: one copy of each logo, a capped activity log, no receipt
photos on the server, and a 30-day TTL on AI usage.

## Not verified

- Gemini's exact active RPM/RPD for a specific project (varies; read it in AI Studio).
- Expo's current maximum single-build duration on the free plan.
