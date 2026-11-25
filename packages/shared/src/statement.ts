import { formatDate, formatMoney } from './format.js';
import { labelsFor } from './labels.js';
import { escapeHtml, type RenderBrand, type RenderParty } from './renderer.js';

/**
 * Client statement (plan section "Exports").
 *
 * One statement per client, one table per currency, with an opening balance so a
 * statement that starts mid-way still adds up. Only issued invoices count:
 * drafts are not owed, void invoices were cancelled, and credit notes are
 * already visible as payments on the invoice they were applied to.
 */

export interface StatementDocument {
  id: string;
  docType: 'invoice' | 'estimate' | 'credit_note';
  number: string | null;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  total: number;
  paid: number;
  balance: number;
}

export interface StatementRow {
  id: string;
  date: string;
  number: string;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
}

export interface StatementSection {
  currency: string;
  openingBalance: number;
  closingBalance: number;
  billed: number;
  paid: number;
  rows: StatementRow[];
}

export interface StatementInput {
  documents: readonly StatementDocument[];
  from?: string | null;
  to?: string | null;
  currency?: string | null;
  today: string;
}

export function buildStatement(input: StatementInput): StatementSection[] {
  const from = input.from ?? null;
  const to = input.to ?? null;
  const sections = new Map<string, StatementSection>();

  const sectionFor = (currency: string): StatementSection => {
    const existing = sections.get(currency);
    if (existing) return existing;
    const created: StatementSection = {
      currency,
      openingBalance: 0,
      closingBalance: 0,
      billed: 0,
      paid: 0,
      rows: [],
    };
    sections.set(currency, created);
    return created;
  };

  for (const document of input.documents) {
    if (document.docType !== 'invoice') continue;
    if (document.status === 'draft' || document.status === 'void') continue;
    if (input.currency && document.currency !== input.currency) continue;
    if (!document.issueDate) continue;

    const section = sectionFor(document.currency);

    // Anything issued before the period is summarised as the opening balance.
    if (from && document.issueDate < from) {
      section.openingBalance += document.balance;
      continue;
    }
    if (to && document.issueDate > to) continue;

    section.rows.push({
      id: document.id,
      date: document.issueDate,
      number: document.number ?? 'Draft',
      dueDate: document.dueDate,
      total: document.total,
      paid: document.paid,
      balance: document.balance,
    });
    section.billed += document.total;
    section.paid += document.paid;
  }

  for (const section of sections.values()) {
    section.rows.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    const change = section.rows.reduce((total, row) => total + row.balance, 0);
    section.closingBalance = section.openingBalance + change;
  }

  return [...sections.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface StatementRenderInput {
  business: RenderParty;
  client: RenderParty;
  brand: RenderBrand;
  sections: readonly StatementSection[];
  from?: string | null;
  to?: string | null;
  today: string;
}

/** The printable statement. Pure HTML, the same source the PDF is made from. */
export function renderStatementHtml(input: StatementRenderInput): string {
  const { business, client, brand, sections, today } = input;
  const language = brand.language ?? 'en';
  const labels = labelsFor(language);
  const color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : '#1F5F4A';
  const pageSize = brand.pageSize === 'LETTER' ? 'letter' : 'A4';
  const period =
    input.from || input.to
      ? `${input.from ? formatDate(input.from, language) : '…'} – ${
          input.to ? formatDate(input.to, language) : '…'
        }`
      : null;

  const money = (amount: number, currency: string) => formatMoney(amount, currency, language);
  const date = (value: string | null | undefined) => (value ? formatDate(value, language) : '');

  const sectionsHtml = sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(date(row.date))}</td>
            <td>${escapeHtml(row.number)}</td>
            <td>${escapeHtml(date(row.dueDate))}</td>
            <td class="num">${escapeHtml(money(row.total, section.currency))}</td>
            <td class="num">${escapeHtml(money(row.paid, section.currency))}</td>
            <td class="num strong">${escapeHtml(money(row.balance, section.currency))}</td>
          </tr>`,
        )
        .join('');

      return `<section class="currency">
        <div class="currency-head">
          <h2>${escapeHtml(section.currency)}</h2>
          <span>${escapeHtml(labels.asOf)} ${escapeHtml(date(today))}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>${labels.issueDate}</th>
              <th>${labels.invoice}</th>
              <th>${labels.dueDate}</th>
              <th class="num">${labels.total}</th>
              <th class="num">${labels.amountPaid}</th>
              <th class="num">${labels.balanceDue}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty">${labels.noInvoices}</td></tr>`}</tbody>
        </table>
        <div class="totals">
          <div><span>${labels.openingBalance}</span><span>${escapeHtml(
            money(section.openingBalance, section.currency),
          )}</span></div>
          <div><span>${labels.total}</span><span>${escapeHtml(
            money(section.billed, section.currency),
          )}</span></div>
          <div><span>${labels.amountPaid}</span><span>${escapeHtml(
            money(section.paid, section.currency),
          )}</span></div>
          <div class="closing"><span>${labels.closingBalance}</span><span>${escapeHtml(
            money(section.closingBalance, section.currency),
          )}</span></div>
        </div>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(labels.statement)} ${escapeHtml(client.name)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  @page { size: ${pageSize}; margin: 12mm; }
  body {
    color: #16211C;
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 190mm; margin: 0 auto; padding: 10mm 6mm; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 1mm solid ${color}; padding-bottom: 5mm; }
  .brand-name { font-size: 18pt; font-weight: 700; }
  .muted { color: #5C6B63; font-size: 9pt; }
  h1 { margin: 0; font-size: 22pt; letter-spacing: 0.02em; }
  h2 { margin: 0; font-size: 12pt; }
  .parties { display: flex; justify-content: space-between; gap: 8mm; margin: 6mm 0; }
  .party-name { font-weight: 700; }
  .currency { margin-top: 7mm; page-break-inside: avoid; }
  .currency-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #5C6B63; border-bottom: 0.4mm solid ${color}; padding: 0 2mm 2mm; }
  td { padding: 2mm; border-bottom: 0.2mm solid #E3DFD2; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 600; }
  .empty { color: #5C6B63; text-align: center; padding: 6mm; }
  .totals { width: 74mm; margin-left: auto; margin-top: 3mm; }
  .totals div { display: flex; justify-content: space-between; gap: 6mm; padding: 1.2mm 0; color: #3E4B44; }
  .totals .closing { border-top: 0.4mm solid ${color}; margin-top: 1mm; padding-top: 2mm; font-weight: 700; color: ${color}; }
  footer { margin-top: 10mm; border-top: 0.2mm solid #E3DFD2; padding-top: 3mm; color: #7A857E; font-size: 8pt; display: flex; justify-content: space-between; gap: 6mm; }
  @media screen { .page { padding: 4mm; } }
</style>
</head>
<body>
<div class="page">
  <header>
    <div>
      <div class="brand-name">${escapeHtml(business.name)}</div>
      <div class="muted">${[business.email, business.phone, business.address]
        .filter((value): value is string => Boolean(value))
        .map((value) => escapeHtml(value))
        .join('<br>')}</div>
    </div>
    <div style="text-align:right">
      <h1>${escapeHtml(labels.statement)}</h1>
      <div class="muted">${period ? escapeHtml(period) : escapeHtml(labels.asOf + ' ' + date(today))}</div>
    </div>
  </header>

  <section class="parties">
    <div>
      <div class="muted">${escapeHtml(labels.billTo)}</div>
      <div class="party-name">${escapeHtml(client.name)}</div>
      <div class="muted">${[client.email, client.phone, client.address, client.taxId]
        .filter((value): value is string => Boolean(value))
        .map((value) => escapeHtml(value))
        .join('<br>')}</div>
    </div>
    <div class="muted" style="text-align:right">
      ${escapeHtml(labels.statementFor)} ${escapeHtml(date(today))}
    </div>
  </section>

  ${sectionsHtml || `<p class="muted">${escapeHtml(labels.noInvoices)}</p>`}

  <footer>
    <span>${escapeHtml(business.name)}</span>
    <span>${escapeHtml(business.website ?? '')}</span>
  </footer>
</div>
</body>
</html>`;
}
