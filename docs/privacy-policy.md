# Invoxa privacy policy

**Status: draft.** Fill the two placeholders below and have the business owner review it before it
is published. Play and the App Store require a public URL, which needs a deployed page or static
host.

_Last updated: [date]_

Invoxa ("the app") is an invoicing tool for small businesses. This policy explains what the app
stores, where it goes and how to remove it. It describes the app's actual behaviour; if the app
changes, this page must change with it.

Contact: **[contact email]**

## What we store

When you create an account, the server stores:

- your name and email address, and a bcrypt hash of your password (never the password itself);
- the businesses you belong to, your role in each, and the invite codes you create (stored hashed,
  single use, expiring after seven days);
- the data you enter for each business: business profile and brand images (logo, signature),
  clients, documents (invoices, estimates, credit notes) with their lines, payments and late fees,
  expenses, projects, tracked time, recurring schedules, saved line items, and the activity log;
- a count of AI requests per user per day, kept for 30 days.

Money is stored as whole minor units; documents keep the client and brand details they had when
they were issued.

## What stays on your phone

- Your sign-in token and a small session snapshot are kept in the device's secure storage.
- The app-lock setting and its inactivity timeout stay on the phone; the server never learns
  whether the lock is on.
- Reminder notifications are scheduled locally by the phone. There is no push service.
- Receipt photos are resized on the phone and sent for reading, but the photo itself is not stored
  by the server; only the fields you confirm are saved.

## The AI features

Typed or spoken invoice descriptions and receipt photos are sent to Google's Gemini API through our
server. For drafting, the request contains your text, today's date, your time zone, the default
currency and tax rate, and a list of client names and IDs (at most 200). It never contains client
addresses, emails or existing invoices. For receipt scanning, the request contains the resized
photo, which is discarded after the fields are read.

On Google's free tier, prompts may be used to improve Google's products. Do not enter information
you are not allowed to share. If that is not acceptable for your business, do not use the AI
features; every screen also works by hand.

## What we never do

- We do not sell your data.
- We do not send invoices, reminders or emails from the server. Sending happens through your
  phone's share sheet or a link you choose.
- We do not use advertising or analytics trackers.
- We do not store card or bank details. Payment instructions and payment links are text you type.

## Who can see it

People you invite to a business can see that business's data according to their role: owners manage
everything, staff create and edit documents and records, viewers can only read. Invites use a
single-use code you share yourself. Our hosting providers process the data on our behalf: MongoDB
Atlas (database), Render (API hosting) and, for the AI features, Google (Gemini).

## How long we keep it

- Business records stay until you delete them. Invoices that were issued are voided rather than
  deleted, so their numbers stay meaningful.
- The activity log keeps the newest 250 entries per business.
- AI usage counters are deleted after 30 days.
- Deleting your account removes every business you solely own, with its clients, documents,
  expenses, projects, time, invites, activity and AI usage. If others still belong to a business
  you own, transfer ownership or remove them first; you can also leave businesses you do not own.

## Your choices

- **Export:** Settings → Data & privacy → Backup writes one JSON file of the active business and
  opens your share sheet.
- **Delete:** Settings → Data & privacy → Delete account asks for your password and removes the
  data described above.
- **Correct:** every record can be edited or voided in the app.

## Security

Traffic uses HTTPS. Passwords are hashed with bcrypt and sessions use signed tokens. Every request
is scoped to one business after checking your membership. Brand images are stored once and
referenced by content hash. No system is perfectly secure, so keep your phone and account password
safe.

## Children

Invoxa is a business tool and is not directed at children under 16.

## Changes

If this policy changes, the date at the top changes too. Material changes will be announced in the
app before they take effect.
