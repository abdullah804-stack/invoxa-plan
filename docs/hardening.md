# Hardening: release-candidate audit (week 15)

Checked on **25 November 2026** against the week-15 checklist in the roadmap. This file records
what was verified, how, and what is still unverified. The milestone is a release candidate, not a
release: no store build exists and no service is deployed.

## Done-when

| Condition                                         | Result                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| No high or critical audit findings                | Met — `npm audit --audit-level=high` exits 0 (3 moderate, see below)  |
| Every earlier acceptance test passes              | Met for the API; device-only checks are still unverified (see bottom) |
| The app is usable on a slow phone with large text | Not verified — no phone or emulator is attached to this workspace     |

## 1. Security pass

### Scoped helper

Every business-owned collection is read and written through `scoped()` or through a route that
called `resolveTenant()` first. The only direct model calls are:

- `Business.findById(context.businessId)` after a tenant check, in profile, reports, AI, reminders
  and recurring (the ID comes from the membership, never from the request body).
- `Membership` and `User` lookups in `auth.ts`, keyed by the signed-in user.
- `Membership` / `Invite` lookups in `business.ts`, keyed by the actor's membership or by a
  business already resolved from it.
- `Activity.find` and the report aggregations, each with `business` in the filter.

The week-15 suite exercises the resulting behaviour, not just the code shape: another business's
client, invoice, expense, project, time entry, saved item and recurring schedule all answer 404 on
read, and an update or delete aimed at one answers 404 as well. Asking for a foreign business with
`X-Business-Id` is a 404 on `/activity`, `/reminders`, `/backup` and `/members` before any record is
read.

### Rate limits

- Global 120 requests a minute per user or IP; health is exempt so a wake-up ping cannot be
  throttled away.
- 10 a minute per IP on register and login, 5 a minute on each AI route.
- New this week: 20 a minute for `GET /backup`, 10 a minute for `/backup/preview` and
  `/backup/restore`, because those three read or write a whole business and accept an 8 MB body.
- Verified by test: a third sign-in attempt inside the window gets `429 RATE_LIMITED`.

### Uploads and sizes

- Logo and signature: PNG/JPEG magic-byte check, 300 KB / 100 KB decoded limits, stored once by
  SHA-256. A failed upload leaves the previous image in place.
- Receipt scanning: `data:image/png|jpeg;base64` only, 4 MB request cap, image never stored.
- Every other route keeps the 1 MB body limit; only the three backup routes raise it to 8 MB.
- `$`, dotted and prototype keys are stripped from bodies, queries and params before validation.

### Logs and secrets

- Fastify redacts `authorization` and `cookie` headers; the only explicit error log passes `err`
  and a fixed message, never a request body, token or prompt.
- The server refuses to start without `JWT_SECRET` of 32+ characters (spawn test). Only
  `.env.example` files with placeholders are committed; gitleaks runs in CI and as a pre-commit
  hook. Invite codes are stored hashed; Gemini prompts are never logged.

### Dependency audit

`npm audit --audit-level=high` reports **0 high and 0 critical**. Three **moderate** advisories
remain, all one chain — `minimatch` (ReDoS via glob patterns) inside `@expo/fingerprint`, a build
tool that runs at bundle time and never sees request data. `npm audit fix --force` would downgrade
Expo 58 to 52, which is a breaking change to the fixed stack, so it is deliberately not applied.
Revisit when Expo ships a fingerprint release on a patched `minimatch`.

## 2. Ownership tests for every resource

`apps/api/test/week15.test.ts` adds the week-8-to-14 resources that the older ownership suite did
not cover: recurring schedules, expenses, projects, time entries and saved items. It also covers the
regression that motivated the backup work: with 2,050 existing documents, a file containing the
document at position 2,050 is still recognised and skipped rather than duplicated.

Role behaviour (viewer cannot write, staff cannot manage the team, owner-only actions) is covered
by the week-13 suite and preserved.

## 3. Performance

What changed:

- `DocumentRow` is memoised, so scrolling and typing in the invoice search no longer re-render
  every visible row.
- The invoice list's `renderItem` is a stable `useCallback` instead of a new closure per render.
- The invoice `FlatList` renders 12 rows first, 16 per batch, with a window of 9 screens, so a
  long list on a low-end phone does not mount everything at once.
- Backup export now walks collections in 500-row batches. It does more queries than before but no
  longer holds a 2,000-row ceiling, and its memory use stays bounded per batch.

Measured on this machine (Node, not a phone):

- an issued invoice with 5 lines stores at ≈ **1,663 bytes** of JSON;
- an expense stores at ≈ **362 bytes**.

Not measured: first paint, scroll frame time, PDF render time or cold start on a low-end Android
phone. Those need hardware and are the main open item for this milestone.

## 4. Accessibility

- Text scaling was already enabled everywhere (no `allowFontScaling={false}`). The button label now
  wraps to two lines instead of being cut off at one, and the button grows with it, so large text
  does not truncate actions such as "Restore these records".
- The document row's screen-reader label now reads number, client, amount and status in one
  sentence instead of number and client only.
- Icon-only controls (back, sort, AI, new) already carry `accessibilityLabel`; filter chips, tabs,
  segmented control and buttons expose their selected/disabled/busy state.
- Contrast, measured from the theme tokens with the WCAG relative-luminance formula (body text
  needs 4.5:1):

  | Pair                     | Light | Dark  |
  | ------------------------ | ----- | ----- |
  | text on background       | 15.59 | 16.09 |
  | text on surface          | 16.56 | 14.61 |
  | muted text on background | 5.29  | 8.37  |
  | muted text on surface    | 5.62  | 7.60  |
  | danger on background     | 6.15  | 7.97  |
  | warning on background    | 5.58  | 10.54 |
  | accent on background     | 7.08  | 8.16  |
  | on-accent text on accent | 7.52  | 7.51  |

  The lowest pair is 5.29:1, above the 4.5:1 minimum. Contrast at large text sizes is therefore not
  a risk; actual layout at 200% font size was not viewed on a device.

## 5. Error paths

| Situation                 | What the user sees                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Server asleep (Render)    | Aborts at 25 s with "The server is taking a while to wake up. Try again."                         |
| No connection / offline   | "Cannot reach the server. Check your connection and try again."                                   |
| Expired or revoked token  | One 401 handler clears the session and returns to sign-in                                         |
| Offline while issuing     | The issue call fails with the network message; the draft stays unsaved locally and can be retried |
| AI key missing or AI down | `AI_FAILED` with a plain message; the manual editor is still offered                              |
| AI daily cap reached      | `AI_QUOTA` with the remaining count at zero and tomorrow's reset                                  |
| Validation failure        | Per-field messages from the same Zod schema the form used                                         |
| Payload too large         | `413 PAYLOAD_TOO_LARGE`, "That request is too large"                                              |
| Rate limited              | `429 RATE_LIMITED`, "Too many requests. Try again soon."                                          |

No new code was needed here; the review confirmed each path exists. They are checked by unit/API
tests where the server produces them, and by inspection on the client.

## 6. Earlier "done when" lines

Re-run in this milestone: the complete API suite (all earlier milestone files plus week 15) and the
shared suite pass. The earlier device-dependent checks remain **unverified** for the same reason as
in weeks 4–14: there is no phone or emulator in this workspace, no Gemini key, and no deployment.
Specifically still to do on hardware: sign-up and restart, PDF share sheet, notification delivery,
offline sync in airplane mode, biometric app lock, file picker and share sheet for a backup, and the
release-candidate feel on a slow phone.

## 7. Free-tier capacity

See the new "Capacity: how many businesses fit in 512 MB" section in `docs/limits.md`. Atlas still
reports 512 MB of data plus indexes for a free cluster, so the single-copy logo design, the 250-row
activity cap and the 30-day AI-usage TTL remain the levers that matter.

## Verdict

The API is a release candidate: no high or critical audit findings, one source of truth for
permissions, every resource covered by a cross-business 404 test, and a complete, resumable backup.
The app is **not** yet a verified release candidate on hardware, and the device items above must be
run before week 16's store build.
