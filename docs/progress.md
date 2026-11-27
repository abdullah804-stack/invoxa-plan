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

## M5 — Mobile core (week 5) — built, device check pending

- [x] Invoice editor for invoices, estimates and credit notes: client picker backed by the client
      book, line items with quantity, price and per-line discount, add/remove lines
- [x] Invoice-level discount (percent or fixed) and tax mode (added or included) with the rate
      from the business profile, all previewed live by the shared `computeTotals` function
- [x] Saved line items: insert a saved line in one tap, and save a line from the editor
- [x] Drafts save through `POST`/`PUT /invoices`; dates, reference, notes and terms; the number
      is still only assigned on issue
- [x] Document detail: issue a draft, record a payment (amount, method, reference, note), mark
      paid, undo mark paid, void (owners), duplicate, and delete a draft
- [x] Issued documents show their frozen client copy, lines, totals, payments and notes; editing
      is only offered on drafts
- [x] Client book tab: search, archived filter, loading, empty and error states, create and edit
      a client with the shared Zod schema inline errors
- [x] Client detail with billed, paid, outstanding and overdue per currency and the documents
      issued to that client; archive instead of delete when history needs it
- [x] New `GET /clients/:id` read so those totals are computed once on the server from the same
      shared function, not folded on the phone
- [x] Brand onboarding no longer shows a logo preview before the upload succeeded: a failed
      upload leaves the previously saved logo (or none) and shows the error

**Done when:** on a phone you write an invoice with a discount and tax, issue it, record a part
payment, and see the client's billed/paid/outstanding update — **not yet verified on hardware**
(same missing device as M4). What is verified: strict TypeScript for all three workspaces,
ESLint and Prettier, `npm test` at 62 API tests (including the new client-summary case) plus
the shared suite, and an Android Metro bundle (`expo export --platform android`). No screen was
clicked through on a device or emulator in this workspace.

## M6 — Branded PDF (week 6) — built, device check pending

- [x] `renderInvoiceHtml` in `packages/shared`: one pure HTML/CSS renderer, no DOM and no
      network, computing its totals with the shared `computeTotals`
- [x] Three templates (classic, modern, minimal), logo left/right/centred, the brand colour with
      a readable on-brand text colour, A4 or Letter through `@page`, paid/overdue/void stamps
- [x] Header with business contact and logo, bill-to block with dates and reference, line table
      (discount column only when a line has one), totals, payments, notes, terms, payment
      instructions and an https pay link, signature block and footer
- [x] Every user value escaped, the colour validated, image sources limited to PNG/JPEG data
      URLs and links to https, so document text can never inject markup into the PDF
- [x] Document preview screen: the real HTML in a web view (`react-native-webview`, scripts off)
      with Share PDF (`expo-print` then the share sheet via `expo-sharing`) and Print
- [x] The preview action is on every document, draft, issued or void
- [x] Onboarding Preview now shows the real renderer on the phone (the native preview stays as
      the web fallback) and offers the three templates, saved to the business branding
- [x] `GET /brand-assets/:id`, scoped by business, so an issued document is rendered with the
      logo and signature frozen onto it even after the business changes them

**Done when:** a real invoice opens as a PDF you would send a client, and the share sheet opens
from the phone — **not yet verified on hardware**, because no phone is attached to this
workspace. What is verified: 66 shared tests (11 new renderer tests covering totals, tax modes,
page sizes, templates, escaping, unsafe images/links, stamps and the estimate layout), 63 API
tests including the brand-asset read and its cross-business 404, strict TypeScript, ESLint,
Prettier, and Android **and** web Metro bundles. The rendered page itself was not opened in a
browser or a PDF viewer here.

## M7 — AI drafting (week 7) — built

- [x] `POST /ai/draft`: a sentence in, a validated suggestion out — lines, quantities, prices in
      minor units and an optional percent discount and tax rate
- [x] The assistant never writes, numbers or sends a document; the app turns the suggestion into
      an ordinary draft and opens the normal editor, so totals and dates stay in Invoxa
- [x] Gemini over REST with `x-goog-api-key`, a JSON response schema and a 20-second timeout, so
      no SDK dependency is added
- [x] Own caps below the free tier: `AI_DAILY_LIMIT` (default 30) a day per user and 5 requests a
      minute; a failed call refunds the day's count
- [x] `ai:use` permission (owners and staff) and the usual business scoping; a viewer gets 403
- [x] Prompts carry no business, client or invoice data, and email addresses or links typed by the
      user are replaced before sending
- [x] One-time Gemini notice in the app before the first prompt, kept on the device
- [x] Mobile "Describe it": example prompts, invoice/estimate/credit type, then a real draft with
      an existing client matched by name, or the typed name kept as the client snapshot
- [x] AI entry point on the Invoices list only for roles with `ai:use`; a missing server key and a
      used-up daily quota are shown as plain messages
- [x] Bad model output is rejected (unreadable reply or no usable lines) instead of guessing

**Done when:** on a phone you say what to invoice and get an editable draft — the API side is
verified with a stubbed Gemini client; a real key and a device are still missing here. What is
verified: 72 shared tests (6 new for prompt redaction and the AI schemas), 69 API tests (6 new
for units, redaction in the outgoing prompt, permissions, quota, refunds and validation), strict
TypeScript, ESLint, Prettier, and Android and web Metro bundles. No prompt was sent to Google
from this workspace, because `GEMINI_API_KEY` is not set.

## M8 — Reminders and recurring invoices (week 8) — built

- [x] `GET /reminders`: sent invoices that are overdue or due inside the business warning window,
      with the stored reminder settings, per-currency balances and days until due
- [x] Home shows a "Needs a nudge" card with those counts and opens the invoice list; every
      loading, empty and error path is the same component set as the rest of the app
- [x] Settings lets an owner switch reminders on or off, pick the hour (0–23) and the warning
      window (0–7 days); the values live on the business profile
- [x] Local due-date notifications (`expo-notifications`, no push service and no email): the phone
      schedules one at `due date − warning days`, reconciles them on every Home refresh and asks
      for permission only when reminders are saved
- [x] Recurring invoices: `GET`/`POST /recurring`, `GET`/`PUT`/`DELETE /recurring/:id` and the
      idempotent `POST /recurring/run`
- [x] A schedule is made from an existing invoice, copying its client, lines, discount, tax,
      notes and currency, so there is no second invoice builder to keep in sync
- [x] Each occurrence creates an ordinary **draft** with that occurrence's date and the schedule's
      payment terms; nothing is issued or numbered automatically
- [x] A unique `(schedule, occurrence)` row makes a repeated cron run, a retried call and two
      workers create one draft only; a failed draft removes its row and is retried next time
- [x] Monthly schedules keep the start day across short months (31 Jan → 28 Feb → 31 Mar) and
      yearly ones keep 29 February, both covered by shared tests
- [x] `POST /recurring/run` accepts the `x-job-secret` for the daily job (all businesses) or a
      normal token (the caller's business), and the app calls it on open
- [x] A daily GitHub Actions workflow (06:23 UTC, plus manual dispatch) calls the run endpoint
      with `JOB_SECRET`, so drafts appear without anyone opening the app; it skips with a warning
      until the `API_URL` and `JOB_SECRET` repository secrets exist
- [x] Pausing stops new drafts; resuming does not backfill missed months. Stopping keeps the
      drafts already made
- [x] "Repeat this invoice" on an invoice, and a Recurring list with pause, resume, open the
      original, stop, and a manual "check for due drafts"

**Done when:** a client gets a regular invoice without you rebuilding it, and you are reminded
before one is due — the API is verified end to end; notifications and the screens are not, because
no phone is attached to this workspace. What is verified: 77 shared tests (5 new for monthly,
weekly and yearly date maths), 78 API tests (9 new for schedules, idempotent runs, the job secret,
permissions, business isolation and the reminder split), strict TypeScript, ESLint, Prettier, and
Android and web Metro bundles. No notification was delivered and no screen was clicked here.

## M9 — Expenses (week 9) — built

- [x] Expense model and `GET`/`POST /expenses`, `GET`/`PUT`/`DELETE /expenses/:id`, all businesses
      scoped and paged by a limit of up to 200 newest first
- [x] Amounts are integer minor units, must be more than zero, and keep the currency they were
      spent in; totals are never added across currencies
- [x] Date, category, description, optional vendor, notes and the tax part of the amount; the
      category list is the shared enum (software, travel, meals, supplies, equipment, fees, other)
- [x] `GET /expenses` filters by category and a date range and returns the filtered totals plus
      this month's totals per currency, computed on the server
- [x] `expenses:read` for every role, `expenses:write` for owners and staff; a viewer gets 403 on
      writes and 200 on reads, and another business's expense is 404
- [x] Expenses are separate from invoices, so a receipt can never change what a client owes
- [x] Mobile Expenses tab: this month's total per currency, category chips, newest-first list with
      description, vendor, category and date, plus loading, empty and error states
- [x] Add and edit screen with inline validation, currency taken from the business profile, and a
      confirmed delete that updates every total

**Done when:** you record what the business spends and see this month's costs without touching an
invoice. What is verified: 81 shared tests (4 new for expense validation), 83 API tests (5 new for
create/filter/totals, update/delete, permissions, tenant isolation and validation), strict
TypeScript, ESLint, Prettier, and Android and web Metro bundles. No screen was clicked here, because
no phone is attached to this workspace.

## M10 — Projects and tracked time (week 10) — built

- [x] Project model and `GET`/`POST /projects`, `GET`/`PUT`/`DELETE /projects/:id`: name, optional
      client, status (active, completed, archived), currency, hourly rate, budget, start and due
      dates, notes
- [x] Writes need `clients:write` (owner or staff); every role reads with `projects:read`. Another
      business's project is 404, and a project with time or invoices is archived instead of deleted
      (409)
- [x] Time entries keep their own rate and currency snapshot, so changing a project rate never
      rewrites what was already worked or billed; entries are 1–1440 whole minutes, dated, with a
      description and a billable flag
- [x] `GET /time-entries` filters by project, date range and unbilled, and returns totals (logged,
      billable, unbilled minutes plus their value) computed on the server; `time:write` gates writes
- [x] `POST /projects/:id/bill` groups unbilled billable time by description and rate into one
      **draft** invoice on the project, with the time as fractional-hour lines; the entries are
      marked with the draft they went on and cannot be edited or deleted while billed
- [x] Deleting that draft releases its time back to unbilled, so a mistake never strands hours
- [x] Project detail returns the project, its time totals, its newest entries and its invoices;
      the mobile list, form, detail (with budget progress) and add-time screens sit under Settings
      → Projects, and the empty, loading and error states are all there

**Done when:** you can put a client's work on a project, log hours against it and turn the unbilled
hours into a draft invoice without retyping anything. What is verified: 86 shared tests (5 new for
project, time and billing validation), 89 API tests (6 new for totals, billing and release,
immutability of billed time, permissions, tenant isolation and deletion rules), strict TypeScript,
ESLint, Prettier, and Android and web Metro bundles. No screen was clicked here, because no phone is
attached to this workspace — the visual and device checks for M4–M10 are still unverified.

## M11 — Extra invoice languages (week 11) — built

- [x] `labels.ts` carries three complete dictionaries — English, Spanish and French — with exactly
      the same keys, enforced by a test so a template can never reference a missing string
- [x] `labelsFor()`, `label()` and `documentTitles()` resolve a full tag to its base language
      (`es-MX` → Spanish, `fr-CA` → French) and fall back to English for anything unsupported
- [x] The HTML renderer prints every label, document title, payment method and status stamp from the
      document's language: headers, table columns, totals, notes, stamps and footer
- [x] Money and dates use the same language through `Intl`, and `<html lang>` reflects the
      dictionary actually used, so a screen reader and the PDF agree
- [x] Settings → Business has an Invoice language selector (owner or staff) that saves through the
      existing profile update; the language is already stored on the business and copied into each
      document's brand snapshot, so issued invoices keep theirs
- [x] Onboarding's brand step offers the same language choice, saved with the brand update and
      reflected in the live preview, so a new business starts in Spanish or French
- [x] New tests: all three dictionaries share keys and none is blank, plus renderer checks for
      Spanish, French, a regional tag and an unsupported language

**Done when:** a business can send the same invoice in English, Spanish or French without editing a
template. What is verified: 93 shared tests (7 new for dictionary parity, label resolution and the
three renderings), 89 API tests, strict TypeScript, ESLint, Prettier, and Android and web Metro
bundles. No screen was clicked here, because no phone is attached to this workspace.

## Week 10 follow-up — Project picker in the invoice editor — built

- [x] A draft can point at a project (`projectId`, optional and clearable) and pull that project's
      unbilled billable time on save (`billProjectTime`), grouped by rate and description
- [x] Pulled lines remember their `timeEntryIds`; clearing or changing the project removes those
      lines and releases the entries so no hours are billed twice
- [x] Currency, client and business checks on the project, with `projectId` as the error path
- [x] The editor shows a project row and picker (active projects, narrowed to the chosen client),
      unbilled time for the project, and an "Add unbilled time" switch
- [x] New API tests: pull and totals, no duplicate on re-save, release on unlink, currency mismatch,
      another business's project

**Done when:** a draft started by hand can bill a project's tracked time without leaving the editor.

## M12 — Expenses onto invoices, timer and late fees (week 12) — built

- [x] Expenses gained a `billable` toggle and a `billedDocumentId`; `GET /expenses?unbilled=true`
      lists what can be billed, and a billed expense refuses edits and deletes (409)
- [x] A draft line carries `expenseIds`: saving the draft marks those expenses as billed, releases
      any no longer on a line, and deleting the draft releases them all
- [x] Non-billable, foreign-currency and already-billed expenses are refused before a draft is made;
      another business's expense is 404
- [x] One server-side timer per person (`GET /timer`, `POST /timer/start`, `POST /timer/stop`,
      `DELETE /timer`); stopping banks a time entry at the project rate with the business rounding
      (none, 5 or 15 minutes, never below one minute)
- [x] `POST /ai/scan-receipt`: a shrunk photo in, validated expense fields out, image discarded, no
      expense created until the user confirms; shares the AI daily cap
- [x] The expense form can scan a receipt, shows the "photo not saved or synced" note, and has a
      Billable switch; the invoice editor's Lines header offers unbilled expenses as lines
- [x] Optional late fees (off by default): Settings → Late fees configures the rule and grace days,
      `POST /invoices/:id/late-fee` adds one owner-confirmed adjustment computed from the balance
- [x] The invoice screen shows the fee amount before confirming; the plan's vector (132000 at
      150 bp = 1980) is a test
- [x] Expense report: `GET /reports/expenses` per category and currency, with a screen from the
      Expenses tab
- [x] Work tab: running timer, project picker, active projects with rates, and the archived list;
      projects moved out of Settings
- [x] New shared tests for the fee vector and rounding; 7 new API tests for billing expenses,
      refusals, timer rounding, late-fee rules/permissions, receipt scanning, the report

**Done when:** a scanned receipt becomes a billed line item, a tracked day becomes an invoice line,
and the late-fee test vector passes — the API side is verified with a stubbed Gemini client and a
real database. What is verified: 99 shared tests, 98 API tests, strict TypeScript, ESLint, Prettier,
and Android and web Metro bundles. No receipt photo was sent to Google (no `GEMINI_API_KEY` here) and
no screen was clicked, because no phone is attached to this workspace.

## M13 — Multiple businesses, team seats and activity log (week 13) — built

**Goal:** shared businesses with safe roles.

- [x] `GET`/`POST /businesses`: one account can own or join several businesses; each has its own
      clients, numbering, brand, reminders and reports (both first invoices are `INV-0001`)
- [x] `X-Business-Id` selects the membership on every business route; a non-member still gets 404
- [x] Business switcher appears only with more than one business; creating another and joining one
      update the session without a restart
- [x] Invite codes: 8 characters, SHA-256 hashed at rest, one use, 7-day expiry, owner-only, with
      share-sheet sharing; joining happens on a screen of its own
- [x] Role table enforced on every endpoint: a viewer cannot issue, write or manage the team, staff
      cannot invite or change roles, and only owners void, configure and transfer
- [x] Leave, remove member, change role and transfer ownership; a business always keeps one owner
- [x] Activity log: `GET /activity` newest first with keyset paging, capped at the newest 250 per
      business, written for issues, voids, payments, late fees, clients, expenses, time, team and
      settings; owners and staff read it, viewers do not
- [x] New shared schemas and labels; 9 new API tests for businesses, roles, invites, ownership and
      the log

**Done when:** a staff member can issue an invoice, a viewer cannot, and neither can read another
business's data — verified against the API with a real database: 9 new tests plus the whole suite.
No screen was clicked and no invite was shared from a phone, because no device is attached to this
workspace.

## M14 — Data safety (week 14) — built

**Goal:** users control and protect their data.

- [x] `GET /backup` exports the active business as one versioned JSON file: profile and brand,
      clients, projects, documents with payments and late fees, expenses, time and saved items
- [x] `POST /backup/preview` validates the file and counts what it holds and what already exists;
      `POST /backup/restore` merges by `clientUuid` (documents), name (clients and projects) and
      contents (expenses, time, saved items) and recomputes every total
- [x] Restored documents rejoin the receiving business's numbering; a second run of the same file
      adds nothing
- [x] Backup screen: export and share the JSON through the share sheet, pick a file, preview the
      counts, confirm, and see what was added and kept
- [x] App lock: fingerprint or face with a 1, 5 or 15 minute inactivity timeout, stored on the
      phone; unavailable hardware disables the switch instead of faking it
- [x] Delete account screen with the password and a plain list of what is removed; the API now
      purges clients, documents, expenses, projects, time, invites, activity and AI usage, not just
      the business and its images
- [x] Privacy notice screen: what the server stores, what Gemini receives and what is discarded,
      what stays on the phone, retention, and how to export or delete
- [x] Retention: activity log capped at 250 rows per business (already), AI usage rows deleted
      after 30 days by a TTL index
- [x] 8 new API tests for export, restore totals, merge, malformed files, permissions, deletion,
      retention and settings restore

**Done when:** a backup restores onto a fresh install with identical totals, and deleting an
account removes everything it solely owned — verified against the API with a real database: the
restored invoice keeps its exact totals and paid amount, and after account deletion no user,
business, client or document remains. No screen was clicked, no biometric prompt was shown and no
file was shared, because no device is attached to this workspace.

## M15 — Hardening (week 15) — built, device checks pending

**Goal:** a release candidate.

- [x] Backup completeness (week-14 follow-up): the export reads every row of every collection in
      `_id` order instead of stopping at 2,000, includes recurring schedules (referenced by device
      ID so a restore can find the copied invoice), and reports any schedule whose source document
      is not in the file instead of guessing. Restore recognises existing rows past the first 2,000
      too, and a restored schedule resumes at today rather than backfilling months that are already
      in the file as documents
- [x] Backup files without a client snapshot no longer contain `clientName: null`, which the
      shared schema refuses; a document with no client now exports cleanly
- [x] A backup larger than the 8 MB restore body limit restores in dependency-ordered parts of at
      most 6 MB, split by the shared `splitBackupForUpload`; preview and restore both chunk, merge
      stays idempotent, and a multi-part restore writes one activity row
- [x] `docs/phone-checklist.md` lists every device check weeks 4–15 could not run, with the expected
      result for each and a fixture path for the large-restore case
- [x] Large restores survive the rate limit: the backup routes allow 30 parts a minute (up from 10),
      and the app retries a part on 429, 502–504, network or timeout, honouring `retry-after`; a
      restore that still stops says what was kept, and the query cache is cleared on failure too
- [x] Security pass: scoped-helper audit, per-route rate limits (new: 20/min export, 10/min
      preview and restore), upload checks, log redaction, secret handling, dependency audit
- [x] Ownership matrix for every resource, including weeks 8–14: clients, invoices, expenses,
      projects, time entries, saved items, recurring schedules, activity, reminders, backup and
      members all answer 404 across businesses, on read and on write
- [x] Rate-limit behaviour proved by test: a third sign-in attempt inside the window is `429`
- [x] Accessibility: buttons wrap at large text instead of truncating, document rows read number,
      client, amount and status to a screen reader, and every palette pair measures at least
      5.29:1 contrast in both themes
- [x] Performance work: memoised rows, a stable list renderer and bounded `FlatList` batches; the
      export walks collections in 500-row batches
- [x] Error-path review: server asleep, offline, expired token, offline at issue, AI down, quota,
      validation, payload size and rate limits each have a defined message
- [x] Free-tier capacity estimate from measured record sizes (≈ 1.7 KB per issued invoice, ≈ 0.4 KB
      per expense) in `docs/limits.md`, with the 100 ops/s and 500-connection ceilings noted
- [x] `docs/hardening.md` records the audit, the measurements and every check that could not run
- [x] 8 new API tests in `week15.test.ts`

**Done when:** no high or critical audit findings, every earlier acceptance test passes, and the app
is usable on a slow phone with large text. What is verified: a 10.8 MB export, larger than one
request may carry, restores completely through the app's splitter with no duplicates and one log
row; `npm audit --audit-level=high` exits 0 (three moderate `minimatch` advisories inside Expo's
build tooling remain and are documented); all shared and API tests pass including the volume,
recurring-restore, ownership and rate-limit cases; and contrast is measured from the real tokens. What is **not** verified: slow-phone scrolling,
start-up and PDF render time, and large-text layout on a device — no phone or emulator is attached
to this workspace. See `docs/hardening.md` for the full list.

## M16 — Release (week 16) — prepared locally, nothing deployed

**Goal:** a live app.

- [x] Render Blueprint (`render.yaml`): native Node build, free plan, health check
      `/api/v1/health`, and secrets marked `sync: false` so no value lives in git
- [x] Netlify config (`netlify.toml`) and a root `npm run build:web` that exports the single-page web
      build to `apps/mobile/dist`, with the SPA redirect and immutable asset caching
- [x] EAS profiles (`apps/mobile/eas.json`) and release version fields: `1.0.0`, build 1,
      `appVersionSource: local`
- [x] Monitoring hooks: every response carries `x-request-id` (exposed to the web build) so a report
      can be matched to the API log stream; the keep-warm cost trade-off is calculated in
      `docs/release.md` and `docs/limits.md`
- [x] `docs/release.md`: the runbook for Atlas, Render, Netlify, EAS, monitoring, backup, rollback,
      the five-owner pilot and the release gate, plus every account, secret and authorization still
      needed
- [x] `docs/privacy-policy.md`: store-ready policy matching the app's real data handling (server
      data, on-device data, Gemini, retention, export and deletion)
- [x] `docs/store-listing.md`: Play and App Store copy, data-safety answers, the account-deletion URL
      requirement, content rating and the screenshot shot list
- [x] A health test for the request id; the whole suite stays green
- [ ] Deploy the API and the web build — needs owner accounts and explicit authorization
- [ ] Android (and iOS) release build — needs Expo and store accounts, including third-party fees
- [ ] Five-owner pilot and the post-launch list — needs real users

**Done when:** a stranger installs the app and sends a real invoice without help — **not met**:
nothing is deployed, no store build exists and no phone is attached. Everything that can be done
without accounts is in the repository; `docs/release.md` is the remaining sequence, and it opens
with the list of what is blocked.

## M17 — The missing roadmap features — added

**Goal:** close the twelve features the week 7, 8, 10 and 11 task lists asked for but the milestone
commits did not build.

- [x] Receipt PDF and client statement PDF, from the shared renderer and new API endpoints
- [x] CSV export for documents and expenses: BOM, quoted cells, no formula injection, plain decimals
- [x] Cash-flow, aging, sales-by-client and tax reports, with the rules in `packages/shared/src/reports.ts`
- [x] Tax presets screen in Settings, and preset chips in the invoice editor
- [x] QR code for the payment link, generated on the server from the stored https link
- [x] Refine with AI for notes (`POST /ai/refine`), with the shared daily cap and refund on failure
- [x] Reminder message sheet with WhatsApp, email and share links, in the invoice language
- [x] Offline drafts: a device queue, `POST /sync/invoices` with per-item results and conflicts, a
      cached dashboard and invoice list, and a sync banner
- [x] Conflict resolution: a refused draft records the server's reason and what the server holds,
      the invoice banner shows how many need a decision with a Review step, and
      `app/drafts/conflicts.tsx` answers each one — keep the phone copy (`resolution: 'keep-mine'`,
      which overwrites the server draft, or saves the copy as a new draft once the server copy was
      issued) or discard it. Conflicted drafts are no longer re-sent on every sync
- [x] Voice drafting on the Describe-it screen, hidden where speech recognition cannot run
- [x] 13 shared tests (`reports.test.ts`) and 9 API tests (`week17.test.ts`, including keep-the-phone-
      copy over a draft and as a new draft once issued); suite is 117 shared + 133 API, all green;
      web and Android bundles build; lint, format and typecheck clean
- [ ] The device half of the checklist: PDFs, share sheet, WhatsApp/email hand-off, speech and
      airplane-mode sync — no phone or emulator is attached
- [ ] Live Gemini quality for refine — needs `GEMINI_API_KEY`

**Done when:** every week 7/8/10/11 feature has code, a route or screen, and a test where the rule is
pure. That is met; `docs/features.md` maps each one and states exactly what is not yet verified on a
device.
