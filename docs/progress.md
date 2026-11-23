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
The shared package's 55 tests still pass alongside them, and CI (build + secret scan) is green
on `main`.

## M3 — API domain (week 3) — done

- [x] Clients CRUD with a normalised `nameKey`, search, and archive-instead-of-delete when an
      issued document references the client
- [x] Documents CRUD for invoices, estimates and credit notes in one collection; create is
      idempotent on `clientUuid`
- [x] Issue: atomic `findOneAndUpdate` with `$inc` on the business counter, separate INV, EST
      and CN series, client and brand snapshots, default due date and issue date
- [x] Lifecycle: payments, mark paid, undo to sent, void (owner only), duplicate, convert an
      estimate to an invoice, apply a credit note (capped at the balance and the credit left)
- [x] Issued documents reject item, price, client and currency edits and accept notes, terms
      and due date
- [x] List filters: `docType`, stored and derived `status`, `clientId`, `q`, date range, sort,
      limit (max 100) and keyset cursor paging
- [x] Saved line items; `GET /reports/summary` with totals per currency, counts, due-soon and
      recent documents
- [x] One role helper: the duplicate `assertAction` was removed, so `requireAction` in
      `tenant.ts` is the only way a route checks permissions
- [x] Suites: client book, document lifecycle and numbering, filters and paging, summary,
      saved items, and ownership for every new resource

**Done when:** all lifecycle and ownership tests pass — **verified**: 61 API tests pass, among
them 20 parallel issues producing `INV-0001`…`INV-0020` with no duplicates, overpayment
rejected, issued documents refusing item edits, credit notes capped at the balance, cursor
paging returning each document once, and A→B 404s on documents, clients and saved items.
The shared package's 55 tests still pass alongside them.

## M4 — Mobile foundation (week 4) — built, device check pending

- [x] Expo SDK 58 app with Expo Router, `expo-router/entry`, and a Metro config that watches
      the npm workspace root
- [x] One auth gate in the root layout: signed-out users only see welcome, login and register;
      signed-in users are never left on an auth screen
- [x] SecureStore token and session snapshot, so a restart is instant and stays signed in;
      a 401 from any request signs out in one place
- [x] API client: JWT, `X-Business-Id`, `X-Timezone`, typed errors, field errors, a friendly
      waking-server message and one query client with per-business cache keys
- [x] Theme tokens for light and dark (Paper and Sage), Manrope and Inter, persisted
      light/dark/system switch
- [x] Base components: button, card, input, status pill, segmented control, filter chip,
      skeleton, empty and error states, document row and a swipe-to-duplicate row
- [x] Welcome, register and login with inline field errors from the shared Zod schemas
- [x] Three-step brand onboarding (details, colour and logo, preview) saving to `PUT /profile`
      and `PUT /profile/logo`; logo resized to 600 px and compressed under 300 KB, PNG/JPEG only
- [x] Live brand preview using the business name, colour and logo as the invoice header
- [x] Dashboard: outstanding, billed, paid and overdue per currency, due-soon and recent lists,
      skeleton loading, empty and error states, pull to refresh
- [x] Invoice list: search, status chips, type toggle, sort, cursor paging and swipe to duplicate
- [x] Settings shell with business summary, theme switch, brand edit (owner only) and log out

**Done when:** on a real phone you sign up, set a logo and colour, restart the app, and are
still signed in with the brand saved — **not yet verified on hardware**. What is verified: the
strict TypeScript check passes for the app, ESLint and Prettier pass, and Metro produces an
Android bundle (`expo export --platform android`) with the workspace shared package resolved.
No phone is attached to this workspace, so signing up, picking a logo and restarting on a real
device is still to be done before this milestone is ticked.
