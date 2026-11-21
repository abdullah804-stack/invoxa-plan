# Decisions

Week 1 asks for several product decisions up front. Each one is recorded here with the date
it was made, so later weeks do not reopen it by accident.

## 21 November 2026 — Week 1

### Package manager and workspaces

**npm workspaces**, committed `package-lock.json`. Node 22+ everywhere. The plan allows "npm or
pnpm"; npm ships with Node, keeps the lockfile single-file and is what CI uses with `npm ci`.

### Extra invoice languages: **Spanish and French**

English is required. Spanish and French were chosen because both are widely traded invoicing
languages and **neither needs right-to-left layout**, which the plan flags as extra work and an
extra embedded font for Urdu or Arabic. Adding Arabic or Urdu later is a separate decision with
a real budget, not a swap of a dictionary file.

### Gemini free tier

**Accepted for real customers, with the one-time notice the plan requires** (prompts go to
Google and may be used to improve its products; no addresses, emails or invoices are sent).
Model name stays in `GEMINI_MODEL` so it can change without a release. If a paid tier becomes
necessary, the manual form always remains the fallback and nothing else in the product breaks.

### Free hosts

- API: **Render free web service** (512 MB, sleeps after 15 minutes) — see `docs/limits.md`.
- Web build: **Netlify free** (commercial use allowed; Vercel free is non-commercial).
- Database: **MongoDB Atlas free cluster** (512 MB including indexes).
- Both host accounts still need to be created; nothing is deployed in M0/M1.

### Brand defaults

The "Paper and Sage" light palette from the plan is the default brand colour (`#1F5F4A`), with
the Classic template and the Manrope/Inter pairing. Both themes ship from M4.

### Repository visibility

The plan calls for a **private** repository. The connected repository
(`abdullah804-stack/invoxa-plan`) is currently **public**. This needs a decision from the owner:
either switch it to private in GitHub settings, or accept that the code is public. No secrets
are ever committed either way, but a public repo exposes the product before release.

## 21 November 2026 — Week 2

### bcryptjs instead of native bcrypt

The plan says "bcrypt cost 12". `bcryptjs` is used because it is the same bcrypt algorithm
(cost 12, `$2b$` hashes are interchangeable) without a native build step, which fails often on
Windows and needs a compiler on the deploy host. Hashes produced here verify with any bcrypt
library, so this is a packaging choice, not a change of algorithm.

### API framework: Fastify 5

The plan allows Fastify or Express. Fastify gives schema-level body limits, a first-class
error handler and `inject()` for tests without an open port.

### Rate limiting details

`@fastify/rate-limit` v10 throws the `errorResponseBuilder` result at the error handler, so the
builder returns an `Error` carrying `statusCode: 429`; the response body is still the one
`{ error: { code, message, details } }` shape. Health checks are exempt so a keep-warm ping is
never throttled. Rate-limit bucketing decodes the JWT subject without verifying the signature —
it is used only to pick a bucket, never to authorise.

### Still open

- Final name check against app stores, trademark databases and `.com`/`.app` domains.
- A real Android phone for dev-build testing (voice and notifications).
- Accounts: MongoDB Atlas, Google AI Studio, Expo, Render, Netlify.
