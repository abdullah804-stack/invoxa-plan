# Progress

One section per milestone from the build plan. Each entry records what is done, what "done when"
proves it, and the commit that pushed it. A milestone is only ticked when its "done when" line
is actually true.

## M0 — Repo and tooling (week 1) — done

- [x] Monorepo: `apps/mobile`, `apps/api`, `packages/shared`, npm workspaces, committed lockfile
- [x] Strict TypeScript everywhere (`tsconfig.base.json`, `strict`, `noUncheckedIndexedAccess`)
- [x] ESLint (flat config, typed rules) and Prettier
- [x] Root scripts: `dev:api`, `dev:mobile`, `test`, `lint`, `typecheck`, `format`, `audit`
- [x] `.gitignore`, `.env.example` for API and mobile with placeholders only
- [x] gitleaks pre-commit hook (`.githooks/pre-commit`, enabled with `npm run hooks`)
- [x] CI: install from lockfile, lint, format check, typecheck, test, `npm audit --audit-level=high`, gitleaks
- [x] `docs/limits.md` with sourced, current free-tier limits
- [x] `docs/decisions.md` with the week-1 product decisions

**Done when:** CI is green on an empty test — **verified**: workflow CI completed successfully
on `main` for commit `c21a658`.

## M1 — Shared core (week 1) — done

- [x] Zod schemas: currencies, line items, discounts, payments, documents, business, client
- [x] Totals function (BigInt, half away from zero) with every plan vector as a test
- [x] Status derivation: stored draft/sent/paid/void; derived partial/overdue/expired
- [x] Lifecycle transitions and the "drafts delete, issued void" rules
- [x] Numbering: `INV-`, `EST-`, `CN-` series padded to 4 digits, parse and format
- [x] Money and date formatting, currency exponents, English label dictionary
- [x] English labels, document titles and status labels

**Done when:** all totals and status tests pass — **verified**: 55 tests in 4 files pass
(`totals`, `status`, `numbering`, `schemas`), joined by `npm audit` at 0 vulnerabilities.

## M2 — API foundation (week 2) — done

- [x] Fastify 5 skeleton: health route (no auth, no database call), central error shape with the
      plan's ten codes, Helmet, strict CORS from `CORS_ORIGINS`, 1 MB bodies, rate limits
      (120/min per user, 10/min per IP on register and login)
- [x] Startup guard: `JWT_SECRET` required and at least 32 characters, no fallback; the process
      exits before Mongo is touched (proved by a test that spawns the real entry point)
- [x] Mongoose models: users, memberships, businesses, brandAssets
- [x] bcrypt cost 12, 7-day JWT, owner always taken from the token
- [x] Register creates user + business + owner membership; login; `GET` and `DELETE /auth/me`
      (password required; removes everything the account solely owned)
- [x] Tenant resolution: `X-Business-Id` or the first business, membership check, 404 for
      non-members, 403 from the shared role matrix
- [x] The scoped query helper that injects the business ID into every query
- [x] Operator injection stripped from bodies, queries and params (`$`, dotted, prototype keys)
- [x] Business profile `GET`/`PUT`, logo and signature upload with PNG/JPEG magic-byte checks,
      300 KB / 100 KB limits and single-copy storage by content hash
- [x] Supertest suites: auth, config, health, validation and injection, ownership and roles,
      brand assets

**Done when:** user A cannot read or change user B's business, and the server refuses to boot
without the secret — **verified**: 39 API tests pass, including A→B 404s on read, write and
logo upload, the forged-secret and expired-token cases, and the spawned-process boot refusal.
The shared package's 55 tests still pass alongside them.
