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

**Done when:** CI is green on an empty test — true once the first push runs.

## M1 — Shared core (week 1) — done

- [x] Zod schemas: currencies, line items, discounts, payments, documents, business, client
- [x] Totals function (BigInt, half away from zero) with every plan vector as a test
- [x] Status derivation: stored draft/sent/paid/void; derived partial/overdue/expired
- [x] Lifecycle transitions and the "drafts delete, issued void" rules
- [x] Numbering: `INV-`, `EST-`, `CN-` series padded to 4 digits, parse and format
- [x] Money and date formatting, currency exponents, English label dictionary
- [x] English labels, document titles and status labels

**Done when:** all totals and status tests pass — see `npm test` output in the commit.

## M2 — API foundation (week 2) — next

Server skeleton, health route, central error shape, Helmet, CORS, body limits, rate limits,
Mongoose models (users, memberships, businesses, brandAssets), JWT startup check, auth routes,
scoped query helper, brand asset uploads, Supertest suites.

**Done when:** user A cannot read or change user B's business, and the server refuses to boot
without the secret.
