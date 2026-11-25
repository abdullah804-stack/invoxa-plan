# Phone checklist

Every check below needs a real device or emulator, which the build workspace does not have. Run
them in order on the release-candidate build and record the result for each. Screens, PDFs,
notifications, biometrics and share sheets are otherwise **unverified**.

Tick a milestone's box only when every one of its checks passes; that is the "done when" line from
`docs/progress.md` finally being true.

## Before you start

- [ ] Install a **development build** on Android (Expo Go cannot run on-device voice). Use the same
      build for the whole list so results are comparable.
- [ ] Point the app at the API with `EXPO_PUBLIC_API_URL` (a LAN address for a local API, never
      `localhost` from a phone).
- [ ] Have two accounts ready: **Owner A** with a business, and **Owner B** with a different business
      for the cross-business checks.
- [ ] Have a second person or a second device available for the invite and reminder share sheets.
- [ ] Note the device, OS version, build and date at the bottom.
- [ ] Generate the oversized backup fixture for section 13:
      `BACKUP_FIXTURE_PATH=big-backup.json npm test --workspace @invoxa/api -- test/week15.test.ts`
      then copy `big-backup.json` to the phone.

## M4 — Sign-up, brand and session

- [ ] Register a new account; the welcome, brand step and dashboard all render.
- [ ] Set a logo from the camera roll and a brand colour; the live preview shows both.
- [ ] Force-quit the app and reopen it: still signed in, brand still saved.
- [ ] Switch theme to dark, force-quit, reopen: dark is still the theme.
- [ ] Log out and back in: the session returns to the same business.

**Passes when:** a new user signs up, sets a brand, restarts and is still signed in with the brand
saved.

## M5 — Manual invoice flow

- [ ] Create an invoice with 2 lines, a 10% discount and 10% tax; totals match a hand calculation.
- [ ] Issue it; the number becomes `INV-0001` (or the next in the series).
- [ ] Record a part payment; the row shows **Part paid** and the balance drops.
- [ ] Pay the rest; the row shows **Paid** and the dashboard's outstanding returns to zero.
- [ ] Open the client; billed, paid and outstanding match the invoice.
- [ ] Swipe a row to duplicate; the copy is a draft with a new device ID.
- [ ] Void an issued invoice as an owner; it leaves the totals and cannot be un-voided.

**Passes when:** create → issue → part-pay → pay works on the phone and the dashboard matches.

## M6 — PDF, templates and sharing

- [ ] On each template (Classic, Modern, Minimal), preview an invoice with 1 line and with 30 lines.
- [ ] Long business name wraps; no logo falls back to the name; a 4-line address fits.
- [ ] A paid invoice shows the PAID stamp; a void one shows VOID; a draft shows DRAFT.
- [ ] 30 lines repeat the table header and never split a row across pages.
- [ ] Share PDF opens the OS share sheet and the file opens in a PDF viewer.
- [ ] Share to WhatsApp and to email reaches a real recipient.
- [ ] Receipt PDF for a paid invoice and the client statement PDF both render and total correctly.
- [ ] CSV export opens in Google Sheets with the BOM intact (no `Ã¯Â»Â¿` garbage).

**Passes when:** a branded invoice reaches WhatsApp and email from the phone and the CSV opens
correctly.

## M7 — Voice and AI drafting

- [ ] First prompt shows the one-time Gemini notice; dismiss it.
- [ ] Type "10 hours of design at 120 an hour for Acme" and get an editable draft with the right
      lines and totals.
- [ ] Refine the draft by instruction ("add 2 hours of hosting at 50"); lines update.
- [ ] Two clients with the same name trigger the client picker.
- [ ] Deny microphone permission: the mic is hidden and typing still works.
- [ ] Grant permission: a spoken sentence lands in the box and is never auto-submitted.
- [ ] Exhaust the daily cap; the app shows the quota message and offers the manual form.

**Passes when:** a spoken sentence produces a correct editable draft in under 10 seconds.

## M8 — Reminders and recurring invoices

- [ ] On the first **Mark sent**, the notification permission prompt appears with the one-line
      reason; allow it.
- [ ] A sent invoice due inside the warning window schedules the pre-due, due and overdue
      notifications (set the warning window wide and the reminder hour a few minutes ahead).
- [ ] Force-quit and wait: the notification fires at the reminder hour.
- [ ] Tapping it opens that invoice.
- [ ] Marking the invoice paid stops the remaining notifications.
- [ ] "Repeat this invoice" creates a monthly schedule; "Check for due drafts" turns it into a draft
      dated that occurrence.
- [ ] Pause the schedule; no new draft appears. Resume; no backfill appears.

**Passes when:** a reminder fires on time and tapping it opens the invoice.

## M9 — Expenses

- [ ] Add an expense with vendor, category and tax; it appears in this month's total.
- [ ] Filter by category and date range; the totals follow the filter.
- [ ] Edit and delete it; the monthly total updates.
- [ ] As a viewer, the tab is readable and the add/edit controls are gone.

## M10 — Projects, time and the timer

- [ ] Create a project with a rate and a budget; the Work tab shows it.
- [ ] Start the timer, background the app for a few minutes, stop it: the entry is banked at the
      project rate with the business rounding.
- [ ] Add time manually; totals update.
- [ ] Bill unbilled time: one draft invoice appears with grouped lines and the entries become locked.
- [ ] Delete that draft: the time is released and can be billed again.

## M11 — Extra languages

- [ ] Switch the invoice language to Spanish, then French, and preview.
- [ ] Every label, stamp, date and money format follows the language; no English leaks through.
- [ ] An already-issued invoice keeps the language it was issued in.

## M12 — Receipts, billable expenses and late fees

- [ ] Scan a real receipt; confirm the fields in the review form; the image is not kept.
- [ ] The created expense is marked "photo not saved or synced".
- [ ] Mark it billable and add it as a line on a draft invoice; the expense locks.
- [ ] Delete the draft; the expense is released.
- [ ] Enable late fees in Settings, add one to an overdue invoice: the amount is shown before you
      confirm, and matches the rule.

## M13 — Multiple businesses, team and activity

- [ ] Create a second business; the switcher appears only now, and each business keeps its own
      clients, numbering and brand.
- [ ] Share an invite link through the share sheet; a second account joins with the 8-character code.
- [ ] The joined account sees only the shared business's data.
- [ ] As a viewer: cannot issue, cannot write. As staff: can invoice, cannot invite or change roles.
- [ ] Change a role, remove a member, leave, and transfer ownership; the business always keeps an
      owner.
- [ ] The activity log lists who issued, voided, took payment and changed settings.

## M14 — App lock, backup and account deletion

- [ ] Settings → Security: app lock is offered only when a fingerprint or face is enrolled.
- [ ] Turn it on, background the app past the 1-minute timeout, return: the lock screen covers the
      app and a successful biometric unlocks it.
- [ ] A failed biometric keeps the app locked; "use device passcode" follows the OS.
- [ ] Turn the lock off; the app no longer asks.
- [ ] **Backup:** export and share the JSON to yourself; open it and confirm it contains
      `documents`, `recurring` and `clients`.
- [ ] **Restore:** pick that file, see the preview counts, confirm, and check an invoice's totals are
      identical and its number came from the new business's series.
- [ ] Restore the same file again: nothing is duplicated.
- [ ] Privacy notice screen opens and describes Gemini, what stays on the phone, retention and
      deletion.
- [ ] Delete account with the password: the app returns to sign-in and the account cannot log in.

## M15 — Release-candidate checks

### Slow phone and large text

- [ ] On a low-end Android phone (or an emulator with 2 GB RAM and a slow CPU), cold start to a
      usable dashboard in under 5 seconds.
- [ ] Scroll a list of 500+ invoices; it stays responsive while more pages load.
- [ ] Open and share a 30-line invoice PDF in under 5 seconds.
- [ ] Set system font size to the largest setting; walk every main screen and confirm no button
      label, status pill, total or row is cut off or overlapping.
- [ ] With large text, the invoice list, editor, document detail, Settings and the backup screen all
      remain usable without horizontal scrolling.

### Theme and contrast

- [ ] In dark mode, read the dashboard, invoice list, editor and PDF preview: text on every surface
      is legible and no element disappears.
- [ ] In light mode, the same walk-through.

### Error paths

- [ ] Airplane mode → open the app: cached lists stay readable, new requests show "Cannot reach the
      server" and a retry, not a blank screen.
- [ ] Airplane mode → press Issue: the failure is explained and the draft is still there to retry.
- [ ] Stop the API (or wait for Render to sleep) and open a screen: the waking-server message appears
      instead of a hang.
- [ ] Expire the token (change the JWT secret on a dev API) and make any request: the app signs out
      cleanly to the welcome screen.
- [ ] Remove the Gemini key on a dev API: AI shows "not set up" and the manual form still works.

### A backup larger than 8 MB

- [ ] Copy `big-backup.json` (from "Before you start") to the phone.
- [ ] Pick it on the Backup screen; the preview counts appear (the app uploads it in parts).
- [ ] Restore into an empty second business; it completes and the invoice count matches the file.
- [ ] Restore the same file again: every record is reported as kept, nothing is duplicated.
- [ ] Kill the app mid-restore and restore again: the merge finishes without duplicating.
- [ ] Turn airplane mode on for 15 seconds during the restore, then off: the retry finishes the
      restore instead of leaving it half-done.
- [ ] Force the server to rate-limit the restore (a bulk import plus a restore in the same minute):
      the app waits and continues instead of failing.

**Passes when:** the app is usable on a slow phone with the largest text size, every error path says
what happened, and a file larger than the request limit restores completely.

## Record

| Device | OS  | Build | Tester | Date |
| ------ | --- | ----- | ------ | ---- |
|        |     |       |        |      |

| Check | Result | Notes |
| ----- | ------ | ----- |
|       |        |       |
