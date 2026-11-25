# Store listing and data-safety answers

Drafts for Google Play and the App Store, written from what the app actually does. Fill the
placeholders and confirm each answer in the console before submitting; the stores' forms are the
source of truth and change over time.

## Google Play

- **App name (30 characters):** Invoxa — Invoice on the go
- **Short description (80 characters):** Say it. Send it. Get paid. Invoices, estimates and expenses
  for small business.
- **Category:** Business
- **Tags:** invoicing, small business, freelance, estimates, expenses
- **Contact email:** [contact email]
- **Privacy policy URL:** [public URL of docs/privacy-policy.md]

### Full description (under 4,000 characters)

> **Say it. Send it. Get paid.**
>
> Invoxa is an invoicing app made for people who work with their hands and their phone: freelancers,
> consultants, tradespeople and small shops. Describe the job in a sentence or type it by hand, get
> a clean branded PDF, share it on WhatsApp or email, and see who still owes you.
>
> **Invoices that look like your business**
> Add your logo, colour, signature and payment instructions. Pick one of three templates. Every
> invoice, estimate and credit note gets its own number, and issued invoices keep the details they
> were sent with.
>
> **Get paid, not chased**
> Record deposits and instalments, see what is overdue, and add an optional late fee where the rules
> allow it. A polite reminder opens in WhatsApp or email with one tap. Local notifications warn you
> before a due date.
>
> **The rest of the paperwork**
> A client book with totals per client. Expenses by category, with optional receipt scanning.
> Projects, a timer and billable hours that become invoice lines without retyping. Recurring
> invoices for retainer clients, created as drafts you review. Reports for cash flow, sales, tax and
> expenses.
>
> **Built for sharing the work**
> Invite a partner, an accountant or staff with a code and a role. Owners manage, staff invoice,
> viewers only read. An activity log shows who changed what.
>
> **Your data, in your hands**
> Export the whole business as one JSON file, restore it on a new phone, lock the app with your
> fingerprint or face, and delete your account from inside the app.
>
> **Free, no ads, no card required**
> Invoxa is free to use. It does not sell your data and has no advertising trackers. AI drafting and
> receipt scanning use Google's Gemini API; every screen also works by hand.
>
> Invoices print in English, Spanish and French.

### Data safety answers

| Question                                 | Answer                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the app collect or share user data? | Yes, collects; shares with Google only for the AI features you invoke                                                                                                                                                        |
| Data types collected                     | Personal info: name, email, passwords (hashed). Financial info: invoices, payments, expenses (no card or bank numbers). Photos: logo, signature, optional receipt photo. App activity: invoices and other records you create |
| Is data encrypted in transit?            | Yes, HTTPS                                                                                                                                                                                                                   |
| Can users request deletion?              | Yes, in the app (Settings → Data & privacy → Delete account). Provide the web URL too                                                                                                                                        |
| Is data sold?                            | No                                                                                                                                                                                                                           |
| Advertising or tracking?                 | None                                                                                                                                                                                                                         |
| Data shared with third parties           | Gemini API: prompt text and client names for drafting; resized receipt photo for scanning. Hosting: MongoDB Atlas, Render                                                                                                    |
| Optional vs required                     | Account details required; AI features optional; photos optional                                                                                                                                                              |
| Data retention                           | Business records until deleted; activity log newest 250 per business; AI counters 30 days                                                                                                                                    |

### Account deletion URL

Play requires a web page that explains how to delete an account. Host the policy (or a small page)
at a public URL and link to its "Your choices" section; the in-app path is
**Settings → Data & privacy → Delete account** (password required).

### Content rating questionnaire

- No ads, no in-app purchases, no gambling, no user-generated public content, no social features.
- Users can share invoices they create through their phone's share sheet.
- Expected rating: Everyone / PEGI 3.

### Screenshots and graphics (need a device)

Capture at 1080 × 1920 or larger from a release build, in this order:

1. Dashboard with outstanding, paid and overdue totals.
2. Invoice list with status chips.
3. Invoice editor with line items and live totals.
4. Branded PDF preview.
5. "Describe it" AI draft screen.
6. Client detail with billed, paid and outstanding.
7. Expenses with this month's total.
8. Settings showing team, security and data options.

Also needed: app icon 512 × 512, feature graphic 1024 × 500.

## App Store

- **Name:** Invoxa
- **Subtitle (30 characters):** Invoices for small business
- **Keywords:** invoice, invoicing, estimate, receipt, freelance, small business, expenses
- **Category:** Business
- **Age rating:** 4+
- **Privacy nutrition labels:** match the data-safety table above; declare the Gemini sharing for
  user content and identifiers (client names).

Screenshots are the same set, sized for 6.7-inch and 5.5-inch iPhones; iPad screenshots are needed
because the app supports tablets.
