# Invoxa

Invoicing for small-business owners. **Say it. Send it. Get paid.**

A mobile-first invoicing app (Android, iOS, web): type or speak a sentence, get an editable
branded PDF invoice, share it, track payment and get reminded when money is due. Everything
runs on free tiers.

## Layout

| Path              | Contents                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| `apps/mobile`     | Expo app, Expo Router screens, local database, PDF and notifications             |
| `apps/api`        | Fastify server, Mongoose models, routes, AI pipeline, scheduled job              |
| `packages/shared` | Zod schemas, totals function, status derivation, numbering, PDF renderer, labels |
| `docs`            | `limits.md`, `decisions.md`, `progress.md`                                       |

## Commands

```bash
npm install          # install workspaces
npm run typecheck    # build shared, then typecheck every workspace
npm test             # shared totals, status, numbering and schema tests
npm run lint         # ESLint
npm run format       # Prettier
npm run hooks        # enable the gitleaks + typecheck pre-commit hook
npm run dev:api      # Fastify API on PORT (default 4000)
npm run dev:mobile   # Expo app (Expo Go or a dev build)
```

### API (M2–M8)

Base path `/api/v1`. All routes except `register`, `login` and `health` need
`Authorization: Bearer <jwt>`; business routes read `X-Business-Id` (first business if absent)
and `X-Timezone`.

| Area      | Endpoints                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Health    | `GET /health` (no auth, no database call)                                                                                                    |
| Auth      | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `DELETE /auth/me`                                                                 |
| Profile   | `GET /profile`, `PUT /profile`, `PUT`/`DELETE /profile/logo`, `PUT`/`DELETE /profile/signature`, `GET /brand-assets/:id`                     |
| Clients   | `GET`/`POST /clients`, `GET`/`PUT`/`DELETE /clients/:id` (the detail read includes per-currency billed, paid and outstanding)                |
| Documents | `GET`/`POST /invoices`, `GET`/`PUT`/`DELETE /invoices/:id`, plus `/issue`, `/payments`, `/status`, `/duplicate`, `/convert`, `/apply-credit` |
| Reports   | `GET /reports/summary`                                                                                                                       |
| AI        | `POST /ai/draft` (a sentence in, a validated draft suggestion out; no document is written)                                                   |
| Reminders | `GET /reminders` (overdue and due-soon sent invoices inside the business warning window)                                                     |
| Recurring | `GET`/`POST /recurring`, `GET`/`PUT`/`DELETE /recurring/:id`, `POST /recurring/run` (idempotent; job secret or a signed-in user)             |
| Extras    | `GET`/`POST /saved-items`, `DELETE /saved-items/:id`                                                                                         |

Errors always use `{ "error": { "code", "message", "details": [] } }`. A record in another
business returns 404, never 403. Copy `apps/api/.env.example` to `apps/api/.env`; the server
refuses to start without a `JWT_SECRET` of 32+ characters. `POST /recurring/run` takes an
`x-job-secret` header when called by a scheduler (set `JOB_SECRET`), and otherwise runs only the
caller's business with a normal token.

### Daily job

`.github/workflows/daily-recurring.yml` runs at 06:23 UTC (and on demand from the Actions tab)
and calls `POST /recurring/run` with the job secret, so recurring drafts appear even when nobody
opens the app. Add two repository secrets under Settings → Secrets and variables → Actions:

- `API_URL` — the deployed API base, e.g. `https://invoxa-api.onrender.com` (with or without
  `/api/v1`).
- `JOB_SECRET` — the same value as the API's `JOB_SECRET`.

Until both exist the run skips with a warning instead of failing. GitHub can delay or drop a
scheduled run, so the endpoint stays idempotent and the app calls it on open as well; a workflow is
also disabled after 60 days without repository activity.

### Mobile (M4–M8)

Expo Router app with an auth gate, SecureStore session, light and dark theme tokens, a three-step
brand setup, a document editor with live shared totals, document detail actions and the client
book.

```bash
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL
npm run dev:mobile                             # then scan the QR code or press a / i / w
```

- `EXPO_PUBLIC_API_URL` defaults to `http://localhost:4000/api/v1`. On an Android emulator the
  laptop server is `http://10.0.2.2:4000/api/v1`; on a phone on the same Wi-Fi use the laptop's
  LAN address and add it to `CORS_ORIGINS` on the API.
- Signing up opens the three-step brand setup: business details, then colour and logo (resized
  on the phone to 600 px and under 300 KB), then a live preview.
- The token and a session snapshot live in SecureStore: a restart is instant and stays signed
  in, and any 401 signs out in one place.
- The editor creates invoices, estimates and credit notes as drafts: pick a client, add lines
  (with a per-line discount or one from your saved items), set a discount and the tax mode, and
  the totals preview uses the same shared function the server stores.
- A document's screen issues drafts, records a payment, marks paid, undoes that, voids (owners),
  duplicates and deletes a draft. Issued documents never change items or prices.
- The Clients tab lists the book with search and archived clients; one client shows billed, paid
  and outstanding per currency and the documents issued to them.
- Every document has a preview built by the shared `renderInvoiceHtml`: the same HTML prints to a
  PDF that opens in the phone's share sheet. Three templates are chosen during brand onboarding.
- Settings switches light, dark or system, and reopens the brand setup. Owners see the edit
  button; staff and viewers do not. A logo only appears after the upload has succeeded.
- "Describe it" turns one sentence into an editable draft: after the one-time Gemini notice it
  creates an ordinary draft (reusing a client with the same name) and opens the editor. AI
  drafting needs `GEMINI_API_KEY` on the API; without it the screen says so plainly.
- The Home screen warns about overdue and due-soon invoices and schedules local notifications on
  the phone at the reminder hour. Settings holds the reminder switch, hour and warning window;
  nothing is emailed, so reminders need no mail service.
- An invoice can be repeated weekly, monthly or yearly from its screen. Each occurrence is a draft
  made on app open or by the daily job, and the schedule can be paused, resumed or stopped under
  Settings → Recurring invoices.

## Rules this codebase follows

- Money is an integer count of minor units; never floating point.
- Only draft, sent, paid and void are stored; overdue, partial and expired are derived.
- Numbers are assigned only on issue, from separate `INV-`, `EST-` and `CN-` series.
- Issued documents are voided, never deleted.
- Everything is business-scoped; every query filters by business after a membership check.
- No secrets in the repository: only `.env.example` with placeholders.
- No paid services. See `docs/limits.md` for the verified free-tier limits.

Built in 16 weeks, one milestone at a time — see `docs/progress.md`.
