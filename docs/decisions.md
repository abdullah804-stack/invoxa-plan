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

## 23 November 2026 — Week 4

### Expo Router with one gate in the root layout

The route tree is `welcome`, `login`, `register`, `(tabs)/index`, `(tabs)/invoices`,
`(tabs)/settings` and `onboarding` as a modal. One effect in `app/_layout.tsx` owns the gate, so
adding a screen cannot accidentally leave a signed-out user inside the app or a signed-in user
on an auth screen. There are no per-group guard layouts to keep in sync.

### Session snapshot in SecureStore, not a network call at boot

Starting the app restores the token, user and business list from SecureStore and then refreshes
`GET /auth/me` in the background. The alternative (a required network round trip at boot) made
"restart and still be signed in" depend on Render's free host being awake. A 401 still clears
SecureStore; a network failure keeps the snapshot.

### No gesture library for one row action

`react-native-gesture-handler` 3.3 (the version Expo SDK 58 installs) no longer ships the legacy
`Swipeable`, and its replacement needs Reanimated and a Babel plugin. Swipe-to-duplicate is one
interaction, so `SwipeRow` is a small `PanResponder` + `Animated` component instead. It works on
iOS, Android and web without another native dependency; the dependency was removed again.

### Native brand preview until the real renderer arrives

The plan suggests a simple HTML preview in week 4. Rendering HTML needs `react-native-webview`,
another native dependency that the real renderer replaces in M6 anyway. `BrandPreview` draws the
same header, bill-to, one line and total natively from the chosen colour and logo, so the
onboarding preview is live and M6 swaps the component for `renderInvoiceHtml` without touching
the flow.

### Theme preference and tokens

`src/theme/tokens.ts` holds one light and one dark palette, spacing, radii, the type scale and
the contrast helper. The preference (light, dark or system) is stored in SecureStore rather than
adding AsyncStorage for one string. On the web build SecureStore is unavailable, so a small
storage wrapper falls back to `localStorage` and then to memory.

### React Query for the API cache

The app uses one query client. Query keys include the active business ID, so a future business
switch cannot show another business's cached figures. Lists use cursor paging through
`useInfiniteQuery`, matching the M3 API; nothing is fetched with `skip`.

### Versions installed for M4

Expo SDK 58 with React 19.3 and React Native 0.88, Expo Router 58, React Query 5, Manrope and
Inter through `@expo-google-fonts`. `npm audit` reports three moderate advisories from Expo's
`@expo/fingerprint` → `minimatch` chain with no high or critical findings; CI gates on high and
above. They are build-time tooling, not shipped code, and Expo owns the fix.

## 23 November 2026 — Week 5

### Client totals come from one server read

The client screen needs billed, paid and outstanding per currency. Folding the client's document
list on the phone would be wrong past one page and would duplicate cancellation rules. M5 adds
`GET /clients/:id`, which reads that client's documents and reuses `computeOutstanding` exactly
as the dashboard summary does, so both screens can never disagree. The response carries the
client, one row per currency and the 20 most recently touched documents.

### The editor previews with the shared totals function, the server stores its own

The editor calls `computeTotals` on every keystroke for the live total and the per-line nets.
The API ignores those numbers: it recomputes and stores `totals` on save, so a preview bug can
never change what is owed. Prices are parsed from text into minor units with `majorToMinor`, and
lines the parser cannot read are left out of the preview rather than treated as zero.

### Drafts only, currency from the profile

The editor only writes drafts; issuing is a separate action on the detail screen, so an accidental
tap cannot spend a number. New documents take the business currency and tax defaults from the
profile. Saved line items are offered only when their currency matches the document, because
inserting a USD price into a EUR invoice would silently change the amount.

### A logo is shown only after the server has it

Onboarding used to set the picked image as the current logo before the upload answered, so a
failed upload looked saved and the preview and the next step disagreed. The preview now changes
only from the upload response; a failure keeps the previous logo (or none) and shows the error.

## 23 November 2026 — Week 6

### The PDF is made on the phone, from shared HTML

The renderer lives in `packages/shared` as a pure string function: it takes the document, the
business and the client, and returns the HTML the browser prints. On the phone `expo-print`
turns that same HTML into a PDF and `expo-sharing` opens the share sheet. There is no headless
Chromium on the API: the free Render instance has 512 MB, Chromium is hundreds of megabytes and
would turn a free host into a paid one, and rendering on the phone also works offline. The
renderer computes totals with `computeTotals` instead of accepting them, so the PDF cannot
disagree with the stored document.

### One HTML, two audiences

The in-app preview is that HTML in a `WebView`, with scripts disabled and a screen-only media
query that fits the page to the phone. Print and PDF keep the physical page (`@page size: A4`
or `letter`, 12–14 mm margins), so what the preview shows and what the client receives are the
same markup. The web build has no web view, so it keeps the native `BrandPreview` in onboarding
and says plainly that PDF export is a phone feature.

### Fonts are system fonts

The plan's font pairs are honoured as families, not embedded font files: a Lora pair uses the
platform serif, the others the platform sans with Manrope-like metrics. Downloading Google Fonts
at print time would make the PDF depend on the network and leak a request to a third party for
every invoice, and embedding three weights of two families costs hundreds of kilobytes in every
PDF. The brand colour, logo, template and layout carry the identity instead.

### Issued documents keep the logo they were issued with

The brand snapshot stores asset IDs, not image bytes, so a later logo change must not rewrite
history. Week 6 adds `GET /brand-assets/:id`, which returns one stored asset scoped to the
business; the preview fetches the snapshot's asset when it differs from the profile's current
one. Viewers can read assets because they can read documents.

### Templates are chosen in onboarding

The renderer supports classic, modern and minimal, so the brand step now lets an owner pick one
and saves it with the colour. Existing businesses keep classic. An issued document renders with
the template frozen in its snapshot.

### New mobile dependencies

`expo-print`, `expo-sharing` and `react-native-webview`, all installed with `expo install` at the
SDK 58 versions. They are official Expo modules and do not need a paid service. `npm audit` still
reports only the three moderate Expo tooling advisories noted in week 4.

## 23 November 2026 — Week 7

### The assistant suggests, Invoxa decides

`POST /ai/draft` returns a suggestion and writes nothing: no document, no number, no email. The
app creates a normal draft from it with the same endpoint a manual draft uses, then opens the
editor, so every rule (currency from the profile, totals computed on the server, numbers only on
issue) still holds. A model reply that cannot be parsed becomes `AI_FAILED` rather than a
half-filled invoice.

### Decimal prices from the model, integer money in the app

The model is asked for decimal amounts in the business currency; the server converts them with
`majorToMinor` and validates the result against the shared `aiDraftSuggestionSchema`. Prices are
clamped, empty descriptions dropped, at most 20 lines kept, and the currency is forced to the
business currency instead of trusting the model's guess. Tax mode comes from the business, and a
rate is only applied when the user stated one.

### Prompts carry nothing from the database

No business details, client records, invoices or saved items are attached to a prompt. Email
addresses and links typed by the user are replaced with `[email removed]` and `[link removed]`
before sending, because the free Gemini tier may use prompts to improve Google's products. The
app shows that notice once and refuses to send until it is accepted.

### Caps are ours, not Google's

Rate limits on the free tier vary per project and change without notice, so Invoxa keeps its own:
5 requests a minute on the route and `AI_DAILY_LIMIT` (30) a day per user, stored in `aiUsage`
keyed by business, user and the user's own date. A call that failed did not use the assistant, so
its count is refunded; an attempt that already exceeded the cap is decremented back too.

### Plain `fetch`, no Gemini SDK

The REST call is one `fetch` with an `x-goog-api-key` header (never a query string, so keys stay
out of URL logs), a response schema and a 20-second abort. That avoids a dependency whose version
would age against the model name, which already lives in `GEMINI_MODEL`.

### Voice input is not in this week

On-device speech recognition needs a development build and cannot run in Expo Go, and no phone is
attached to this workspace. Shipping a screen that cannot be tested would be worse than leaving
it out, so week 7 ships typing, with the notice and quota machinery voice will reuse. Voice stays
on the list for the first milestone with a device.

## 24 November 2026 — Week 8

### Reminders are local notifications, not email

A reminder email needs a mail provider, a sending domain and a paid tier once volume grows, and
the free stack has none. The phone already holds the due dates, so reminders are local
notifications scheduled at `due date − warning days`, plus a Home card for anything overdue. The
business profile keeps `enabled`, `hour` and `daysBefore`; the app reconciles the phone's schedule
on every Home refresh, so a changed setting takes effect without a background service. The
notification permission is requested only when reminders are switched on, never at launch.

### A schedule repeats an invoice; there is no second builder

Creating schedules from an existing invoice means one editor, one client picker and one set of
lines. The schedule stores the fields it repeats as a copy, so editing the original later does not
change what already runs and deleting it does not break the schedule.

### Occurrences are drafts and idempotent

Every occurrence becomes an ordinary draft with that occurrence's date as its issue date and the
schedule's payment terms; numbering, issuing and sending stay manual. `recurringRuns` has a unique
`(schedule, scheduledFor)` index, so a cron run that fires twice, a retried request or two workers
cannot create the same draft twice. The schedule advances only after a successful draft, a failed
one removes its run row and records the message, and a long outage creates at most 12 occurrences
per schedule so nobody is flooded.

### Month-end dates keep their anchor

`nextRunDate` computes from the schedule's start day instead of the last clamped result: 31 January
goes to 28 February and back to 31 March, and 29 February yearly goes to 28 February in later
years. This is unit-tested rather than left to `Date.setMonth`.

### Reminders and schedules are business-scoped like everything else

`GET /reminders` needs `documents:read`, schedule writes need `drafts:create`, and every query goes
through the scoped helper, so a viewer can see what is due but cannot schedule or stop anything.
The job secret is the only unauthenticated path, and it only runs schedules; it cannot read data.

### New mobile dependency

`expo-notifications` at the SDK 58 version, installed with `expo install`. It is an official Expo
module, needs no paid service and is used for local notifications only. `npm audit` still reports
only the three moderate Expo tooling advisories noted in week 4.

### The daily run is a scheduled workflow, not a timer in the API

The free Render instance sleeps after 15 minutes without traffic, so an in-process timer would
rarely fire and would be lost on every spin-down. A GitHub Actions schedule calls the idempotent
run endpoint instead: 06:23 UTC daily plus manual dispatch, authenticated with the `JOB_SECRET`
header from repository secrets (never a file in the repo). GitHub can delay or drop cron runs, which
is why the app still calls the same endpoint on open and why a repeated run cannot duplicate a
draft. With no deployment yet, a missing `API_URL` or `JOB_SECRET` skips the run with a warning
rather than failing every morning.

## 24 November 2026 — Week 9

### Expenses are their own records, not invoice lines

A receipt must never change what a client owes, so expenses live in their own collection with
their own permissions. A later milestone can bill one by copying it into a line; until then the two
ledgers cannot interfere. The amount is the gross money that left the account, the optional tax part
is kept only for reclaiming, and everything is integer minor units like every other amount.

### Totals are per currency, computed on the server

`GET /expenses` returns the totals for the current filter and for the current month, each grouped
by currency and never summed together — the same rule the dashboard uses. Doing it on the server
means the list and the header cannot disagree, and the app does not have to fetch every page to
show a month.

### Categories come from the shared enum

The plan fixes seven categories, and `expenseCategorySchema` was already defined for them, so the
API validates against it and the app renders `EXPENSE_CATEGORY_LABELS` from the shared package.
A new category is one edit in both places, not a string typed in a screen.

### No receipt upload in this milestone

The plan's storage decision is that receipt photos never reach the server; uploading them would
also need a paid bucket or a second file API. The expense keeps the vendor, date, amount and note,
which is what the totals need, and a receipt can stay in the phone's photos.

## 24 November 2026 — Week 10

### Time is an immutable snapshot, billing is a draft

A time entry stores the rate it was worked at, so a later rate change cannot silently reprice past
work. Billing only ever produces a **draft**: the lines are grouped by description and rate, each
line keeps the entry ids that made it, and every entry records the draft it is on. Until the draft
is issued it can be deleted, and deleting releases those entries to unbilled — which is why billed
entries refuse edits and deletes. A wrong number is fixed by deleting the draft, correcting the
time, and billing again.

### Project writes follow the client permission

The permission list has `projects:read` but no `projects:write`, and projects are the same kind of
administrative record as clients, so writes reuse `clients:write` (owner and staff). Tracking time
has its own `time:write`, which staff also hold; a viewer sees projects, totals and invoices but
cannot add hours.

### Projects are archived, not deleted, once they carry work

A project with time or invoices returns 409 on delete and can be set to archived. That keeps
invoices that reference the project resolvable and makes the time ledger auditable. Only an unused
project can be removed.

### The invoice editor still picks its client, not its project

Billing a project sets the project on the draft it creates; invoices written by hand keep their
existing client snapshot. An optional project picker in the editor is a later, smaller change.

## 24 November 2026 — Week 11

### Dictionaries live beside the renderer, not in the app

The PDF is produced from shared HTML, so the labels must travel with that HTML. `labels.ts` holds
one complete dictionary per language and the renderer reads only from the dictionary of the
document's language. A test asserts that Spanish and French have exactly the English keys and that
no value is blank, which is what keeps a new label from silently appearing in English on a French
invoice.

### Regional tags resolve to their base language

A business may store `es-MX` or `fr-CA`; the base language picks the dictionary while `Intl` still
formats money and dates with the full tag. Unknown languages fall back to English, and `<html lang>`
names the dictionary that was actually used rather than a language with no labels.

### Language is a business setting frozen per document

The business profile's existing `language` field now has a Settings control. Documents copy the
language into their brand snapshot when they are created, so changing the setting only affects new
invoices — an issued invoice is never reprinted in a different language. The app's own screens stay
English in this milestone; translating the product UI is a larger, separate job from translating
the invoice a client receives.

### The invoice language is also picked during onboarding

A new business chooses its invoice language on the brand step, next to the template, so the first
invoice it sends can already be Spanish or French. The choice is saved with the same brand update
and the live preview renders in it, so the effect is visible before the flow is finished. Settings
keeps the same control for changing it later.
