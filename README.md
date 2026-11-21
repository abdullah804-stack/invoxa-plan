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
npm run dev:mobile   # Expo app (arrives in M4)
```

### API (M2)

Base path `/api/v1`. All routes except `register`, `login` and `health` need
`Authorization: Bearer <jwt>`; business routes read `X-Business-Id` (first business if absent)
and `X-Timezone`.

| Area    | Endpoints                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------- |
| Health  | `GET /health` (no auth, no database call)                                                       |
| Auth    | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `DELETE /auth/me`                    |
| Profile | `GET /profile`, `PUT /profile`, `PUT`/`DELETE /profile/logo`, `PUT`/`DELETE /profile/signature` |

Errors always use `{ "error": { "code", "message", "details": [] } }`. A record in another
business returns 404, never 403. Copy `apps/api/.env.example` to `apps/api/.env`; the server
refuses to start without a `JWT_SECRET` of 32+ characters.

## Rules this codebase follows

- Money is an integer count of minor units; never floating point.
- Only draft, sent, paid and void are stored; overdue, partial and expired are derived.
- Numbers are assigned only on issue, from separate `INV-`, `EST-` and `CN-` series.
- Issued documents are voided, never deleted.
- Everything is business-scoped; every query filters by business after a membership check.
- No secrets in the repository: only `.env.example` with placeholders.
- No paid services. See `docs/limits.md` for the verified free-tier limits.

Built in 16 weeks, one milestone at a time — see `docs/progress.md`.
