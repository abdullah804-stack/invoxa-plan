import { formatDate, formatMoney } from './format.js';
import { labelsFor } from './labels.js';
import { escapeHtml, type RenderBrand, type RenderParty } from './renderer.js';
import { computeTotals, type InvoiceDiscount, type TaxMode } from './totals.js';

/**
 * Receipt (plan section "Exports").
 *
 * A receipt for an invoice the client has paid. It is deliberately not a second
 * invoice: no due date, no balance chase, just what was paid and when. The same
 * HTML feeds the on-device preview and the shared PDF.
 */

export interface ReceiptPayment {
  amount: number;
  method: string;
  paidAt: string;
  reference?: string | null;
}

export interface ReceiptDocument {
  number: string | null;
  issueDate?: string | null;
  currency: string;
  taxRateBp: number;
  taxMode: TaxMode;
  discount?: InvoiceDiscount | null;
  lateFeesMinor?: number;
  items: readonly {
    description: string;
    quantity: number;
    unitPrice: number;
    discountBp?: number | null;
    unit?: string | null;
  }[];
  payments: readonly ReceiptPayment[];
}

export interface ReceiptRenderInput {
  document: ReceiptDocument;
  business: RenderParty;
  client: RenderParty;
  brand: RenderBrand;
}

export function renderReceiptHtml(input: ReceiptRenderInput): string {
  const { document, business, client, brand } = input;
  const language = brand.language ?? 'en';
  const labels = labelsFor(language);
  const methodLabels: Record<string, string> = {
    cash: labels.cash,
    bank_transfer: labels.bankTransfer,
    card: labels.card,
    mobile_money: labels.mobileMoney,
    cheque: labels.cheque,
    credit_note: labels.creditNoteMethod,
    other: labels.other,
  };
  const color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : '#1F5F4A';
  const pageSize = brand.pageSize === 'LETTER' ? 'letter' : 'A4';

  const totals = computeTotals({
    items: document.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountBp: item.discountBp ?? 0,
    })),
    discount: document.discount ?? null,
    taxRateBp: document.taxRateBp,
    taxMode: document.taxMode,
    lateFeesMinor: document.lateFeesMinor ?? 0,
    paymentsMinor: document.payments.map((payment) => payment.amount),
  });
  const money = (amount: number) => formatMoney(amount, document.currency, language);
  const date = (value: string | null | undefined) => (value ? formatDate(value, language) : '');
  const lastPayment = document.payments[document.payments.length - 1];

  const itemRows = document.items
    .map(
      (item, index) => `<tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="num">${escapeHtml(`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`)}</td>
        <td class="num">${escapeHtml(money(totals.lines[index]?.net ?? 0))}</td>
      </tr>`,
    )
    .join('');

  const paymentRows = document.payments
    .map(
      (payment) => `<tr>
        <td>${escapeHtml(date(payment.paidAt.slice(0, 10)))}</td>
        <td>${escapeHtml(methodLabels[payment.method] ?? payment.method)}</td>
        <td>${escapeHtml(payment.reference ?? '')}</td>
        <td class="num strong">${escapeHtml(money(payment.amount))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(labels.receipt)} ${escapeHtml(document.number ?? '')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  @page { size: ${pageSize}; margin: 14mm; }
  body {
    color: #16211C;
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 185mm; margin: 0 auto; padding: 8mm 4mm; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 1mm solid ${color}; padding-bottom: 5mm; }
  .brand-name { font-size: 18pt; font-weight: 700; }
  .muted { color: #5C6B63; font-size: 9pt; }
  h1 { margin: 0; font-size: 22pt; }
  .parties { display: flex; justify-content: space-between; gap: 8mm; margin: 6mm 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #5C6B63; border-bottom: 0.4mm solid ${color}; padding: 0 2mm 2mm; }
  td { padding: 2mm; border-bottom: 0.2mm solid #E3DFD2; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 600; }
  .summary { display: flex; justify-content: space-between; gap: 8mm; margin-top: 4mm; }
  .totals { width: 78mm; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; gap: 6mm; padding: 1.4mm 0; }
  .totals .grand { border-top: 0.5mm solid ${color}; margin-top: 1mm; padding-top: 2.5mm; font-weight: 700; font-size: 12pt; color: ${color}; }
  .thanks { margin-top: 8mm; font-size: 12pt; font-weight: 600; }
  footer { margin-top: 12mm; border-top: 0.2mm solid #E3DFD2; padding-top: 3mm; color: #7A857E; font-size: 8pt; }
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
      <h1>${escapeHtml(labels.receipt)}</h1>
      <div class="muted">${escapeHtml(document.number ?? '')}</div>
      ${lastPayment ? `<div class="muted">${escapeHtml(date(lastPayment.paidAt.slice(0, 10)))}</div>` : ''}
    </div>
  </header>

  <section class="parties">
    <div>
      <div class="muted">${escapeHtml(labels.billTo)}</div>
      <div class="strong">${escapeHtml(client.name)}</div>
      <div class="muted">${[client.email, client.phone, client.address]
        .filter((value): value is string => Boolean(value))
        .map((value) => escapeHtml(value))
        .join('<br>')}</div>
    </div>
    ${
      lastPayment
        ? `<div class="muted" style="text-align:right">
            ${escapeHtml(labels.paymentMethod)}<br>
            <span class="strong">${escapeHtml(
              methodLabels[lastPayment.method] ?? lastPayment.method,
            )}</span>
          </div>`
        : ''
    }
  </section>

  <table>
    <thead><tr><th>${labels.description}</th><th class="num">${labels.quantity}</th><th class="num">${labels.amount}</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="summary">
    <div></div>
    <div class="totals">
      <div><span>${labels.subtotal}</span><span>${escapeHtml(money(totals.subtotal))}</span></div>
      ${
        totals.discount > 0
          ? `<div><span>${labels.discount}</span><span>${escapeHtml(money(totals.discount))}</span></div>`
          : ''
      }
      ${
        totals.tax > 0
          ? `<div><span>${document.taxMode === 'included' ? labels.taxIncluded : labels.taxAdded}</span><span>${escapeHtml(money(totals.tax))}</span></div>`
          : ''
      }
      <div class="grand"><span>${labels.total}</span><span>${escapeHtml(money(totals.total))}</span></div>
      <div><span>${labels.amountPaid}</span><span>${escapeHtml(money(totals.paid))}</span></div>
      <div><span>${labels.balanceDue}</span><span>${escapeHtml(money(totals.balance))}</span></div>
    </div>
  </div>

  <div class="thanks">${escapeHtml(labels.receivedWithThanks)}</div>

  ${
    paymentRows
      ? `<div style="margin-top:8mm">
          <div class="muted" style="text-transform:uppercase;letter-spacing:0.1em">${labels.payments}</div>
          <table>
            <thead><tr><th>${labels.paymentDate}</th><th>${labels.paymentMethod}</th><th>${labels.reference}</th><th class="num">${labels.amount}</th></tr></thead>
            <tbody>${paymentRows}</tbody>
          </table>
        </div>`
      : ''
  }

  <footer>${escapeHtml(business.name)} · ${escapeHtml(business.website ?? '')}</footer>
</div>
</body>
</html>`;
}
