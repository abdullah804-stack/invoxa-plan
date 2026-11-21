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

### CI secret scan: gitleaks binary, not gitleaks-action

The plan asks for gitleaks in CI; it does not require the wrapper action. `gitleaks-action@v2`
failed on this repository and its log is only readable with admin rights, so CI installs the
pinned release (`8.30.1`) and runs `gitleaks git .` with the committed `.gitleaks.toml`. One
false positive came from the deterministic test signing key; the key is now assembled at
runtime and the historical fixture is allowlisted by content, so the whole history scans clean.

## 21 November 2026 — Week 3

### One permission helper

`scoped.ts` had `assertAction`, an exact copy of `requireAction` in `tenant.ts`. The copy was
removed; `requireAction` is now the only role check a route can call after `resolveTenant`.

### Numbering is a counter on the business

The plan's rule is an atomic `findOneAndUpdate` with `$inc`. The counter lives on the business
(`counters.invoice`, `counters.estimate`, `counters.credit_note`), so two parallel issues of
different documents serialise on that one document and can never take the same number. The
number is formatted from the business prefix and the returned counter. A failed save after the
increment leaves a gap, which the plan allows; nothing ever reuses a number.

### Mark paid records a settlement payment

`paid` is set when the balance reaches zero, and `paid = sum of payments`. Mark paid therefore
records a payment for the remaining balance (method `other`) flagged internally as a settlement;
undo to sent removes exactly that payment and leaves real recorded payments alone. Without this,
an invoice marked paid would report money as received that no payment record accounts for.

### Delete a client: archive when history needs it

An unused client is deleted. A client referenced by any non-draft document is archived instead,
so an issued invoice keeps the client name it was sent with. Drafts that pointed at a deleted
client keep their own client snapshot.

### List paging uses keyset cursors

Lists return `{ documents, nextCursor }`; the cursor carries the last row's sort value and id and
the next query continues strictly after it. This avoids `skip` slowing down and avoids rows
repeating while new documents arrive.

### Still open

- Final name check against app stores, trademark databases and `.com`/`.app` domains.
- A real Android phone for dev-build testing (voice and notifications).
- Accounts: MongoDB Atlas, Google AI Studio, Expo, Render, Netlify.
