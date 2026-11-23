import { formatDate, formatMoney } from './format.js';
import { computeTotals, type InvoiceDiscount, type TaxMode } from './totals.js';
import { DOCUMENT_TITLES, LABELS } from './labels.js';
import type { DocumentType, ShownStatus } from './status.js';

/**
 * The one invoice renderer (plan section "PDF").
 *
 * It is a pure string function: no DOM, no network, no fonts fetched at print
 * time. The same HTML feeds the in-app preview and the printed PDF, so what a
 * business sees is exactly what the client receives. Totals are computed here
 * with the shared `computeTotals`, never passed in, so a preview can never
 * disagree with the stored document.
 *
 * Every value that comes from a user is escaped, brand colours are validated,
 * image sources must be PNG or JPEG data URLs and payment links must be https.
 */

export type InvoiceTemplate = 'classic' | 'modern' | 'minimal';
export type HeaderLayout = 'logo-left' | 'logo-right' | 'centered';
export type PageSize = 'A4' | 'LETTER';

export interface RenderParty {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  website?: string | null;
}

export interface RenderLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountBp?: number | null;
  unit?: string | null;
}

export interface RenderPayment {
  amount: number;
  method: string;
  paidAt: string;
  reference?: string | null;
}

export interface RenderDocument {
  docType: DocumentType;
  number: string | null;
  shownStatus: ShownStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  validUntil?: string | null;
  reference?: string | null;
  notes?: string | null;
  terms?: string | null;
  currency: string;
  taxMode: TaxMode;
  taxRateBp: number;
  discount?: InvoiceDiscount | null;
  items: readonly RenderLineItem[];
  payments?: readonly RenderPayment[];
  lateFeesMinor?: number;
}

export interface RenderBrand {
  color: string;
  template: InvoiceTemplate;
  headerLayout: HeaderLayout;
  pageSize: PageSize;
  language?: string;
  fontPair?: 'manrope-inter' | 'lora-inter' | 'space-grotesk-inter';
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
  paymentInstructions?: string | null;
  paymentLink?: string | null;
}

export interface RenderInvoiceInput {
  document: RenderDocument;
  business: RenderParty;
  client: RenderParty;
  brand: RenderBrand;
}

const DEFAULT_COLOR = '#1F5F4A';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: LABELS.cash,
  bank_transfer: LABELS.bankTransfer,
  card: LABELS.card,
  mobile_money: LABELS.mobileMoney,
  cheque: LABELS.cheque,
  credit_note: LABELS.creditNoteMethod,
  other: LABELS.other,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(value: string | null | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_COLOR;
}

/** Only PNG or JPEG data URLs are ever placed in an image source. */
function safeImage(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(value) ? value : null;
}

function safeHttpsLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function readableOn(hex: string): string {
  const clean = hex.slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const srgb = Number.parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onWhite >= onBlack ? '#FFFFFF' : '#0B1512';
}

function fontStack(fontPair: RenderBrand['fontPair']): { body: string; heading: string } {
  if (fontPair === 'lora-inter') {
    return {
      body: "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      heading: "Georgia, 'Times New Roman', serif",
    };
  }
  if (fontPair === 'space-grotesk-inter') {
    return {
      body: "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      heading: "'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
    };
  }
  return {
    body: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    heading: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  };
}

function pageDimensions(pageSize: PageSize): { width: string; height: string; cssSize: string } {
  return pageSize === 'LETTER'
    ? { width: '216mm', height: '279mm', cssSize: 'letter' }
    : { width: '210mm', height: '297mm', cssSize: 'A4' };
}

function stampFor(status: ShownStatus): string {
  if (status === 'paid') return `<span class="stamp stamp-paid">${LABELS.paid}</span>`;
  if (status === 'void') return `<span class="stamp stamp-void">${LABELS.void}</span>`;
  if (status === 'overdue') return `<span class="stamp stamp-overdue">${LABELS.overdue}</span>`;
  return '';
}

export function renderInvoiceHtml(input: RenderInvoiceInput): string {
  const { document, business, client, brand } = input;
  const language =
    brand.language && /^[a-z]{2}(-[A-Z]{2})?$/.test(brand.language) ? brand.language : 'en';
  const currency = document.currency;
  const color = safeColor(brand.color);
  const onBrand = readableOn(color);
  const page = pageDimensions(brand.pageSize);
  const fonts = fontStack(brand.fontPair);

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
    paymentsMinor: (document.payments ?? []).map((payment) => payment.amount),
  });

  const money = (amount: number): string => formatMoney(amount, currency, language);
  const date = (value: string | null | undefined): string =>
    value ? formatDate(value, language) : '';

  const title = DOCUMENT_TITLES[document.docType];
  const logo = safeImage(brand.logoDataUrl);
  const signature = safeImage(brand.signatureDataUrl);
  const paymentLink = safeHttpsLink(brand.paymentLink);
  const hasLineDiscount = document.items.some((item) => (item.discountBp ?? 0) > 0);

  const logoTag = logo
    ? `<img class="logo" src="${logo}" alt="${escapeHtml(business.name)} logo">`
    : `<div class="logo logo-initial" aria-hidden="true">${escapeHtml(
        (business.name.trim()[0] ?? 'I').toUpperCase(),
      )}</div>`;

  const businessContact = [business.email, business.phone, business.address]
    .filter((value): value is string => Boolean(value))
    .map((value) => `<div>${escapeHtml(value)}</div>`)
    .join('');

  const clientDetails = [client.email, client.phone, client.address, client.taxId]
    .filter((value): value is string => Boolean(value))
    .map((value) => `<div>${escapeHtml(value)}</div>`)
    .join('');

  const metaRows: { label: string; value: string }[] = [];
  if (document.issueDate)
    metaRows.push({ label: LABELS.issueDate, value: date(document.issueDate) });
  if (document.docType === 'estimate') {
    if (document.validUntil) {
      metaRows.push({ label: LABELS.validUntil, value: date(document.validUntil) });
    }
  } else if (document.dueDate) {
    metaRows.push({ label: LABELS.dueDate, value: date(document.dueDate) });
  }
  if (document.reference) metaRows.push({ label: LABELS.reference, value: document.reference });

  const rows = document.items
    .map((item, index) => {
      const line = totals.lines[index];
      const quantity = `${item.quantity}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}`;
      return `<tr>
        <td class="col-description">${escapeHtml(item.description)}</td>
        <td class="num">${escapeHtml(quantity)}</td>
        <td class="num">${money(item.unitPrice)}</td>
        ${hasLineDiscount ? `<td class="num">${((item.discountBp ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '')}%</td>` : ''}
        <td class="num strong">${money(line?.net ?? 0)}</td>
      </tr>`;
    })
    .join('');

  const totalRows: { label: string; value: string; className?: string }[] = [
    { label: LABELS.subtotal, value: money(totals.subtotal) },
  ];
  if (totals.discount > 0) {
    totalRows.push({ label: LABELS.discount, value: `-${money(totals.discount)}` });
  }
  if (totals.lateFees > 0) {
    totalRows.push({ label: LABELS.lateFee, value: money(totals.lateFees) });
  }
  if (totals.tax > 0) {
    totalRows.push({
      label: document.taxMode === 'included' ? LABELS.taxIncluded : LABELS.taxAdded,
      value: money(totals.tax),
    });
  }
  totalRows.push({ label: LABELS.total, value: money(totals.total), className: 'grand' });
  if (totals.paid > 0) {
    totalRows.push({ label: LABELS.amountPaid, value: `-${money(totals.paid)}` });
  }
  if (totals.paid > 0 || totals.lateFees > 0 || totals.discount > 0) {
    totalRows.push({
      label: LABELS.balanceDue,
      value: money(totals.balance),
      className: 'balance',
    });
  }

  const totalsHtml = totalRows
    .map(
      (row) =>
        `<tr class="${row.className ?? ''}"><th>${row.label}</th><td class="num">${row.value}</td></tr>`,
    )
    .join('');

  const paymentsHtml =
    document.payments && document.payments.length > 0
      ? `<div class="payments">
          <div class="section-title">${LABELS.amountPaid}</div>
          ${document.payments
            .map(
              (payment) => `<div class="payment">
                <span>${money(payment.amount)}</span>
                <span>${escapeHtml(
                  PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
                )} · ${date(payment.paidAt.slice(0, 10))}${
                  payment.reference ? ` · ${escapeHtml(payment.reference)}` : ''
                }</span>
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  const notesHtml = document.notes
    ? `<div class="note"><div class="section-title">${LABELS.notes}</div><p>${escapeHtml(
        document.notes,
      )}</p></div>`
    : '';
  const termsHtml = document.terms
    ? `<div class="note"><div class="section-title">${LABELS.terms}</div><p>${escapeHtml(
        document.terms,
      )}</p></div>`
    : '';
  const instructionsHtml = brand.paymentInstructions
    ? `<div class="note"><div class="section-title">${LABELS.paymentInstructions}</div><p>${escapeHtml(
        brand.paymentInstructions,
      )}</p></div>`
    : '';
  const linkHtml = paymentLink
    ? `<div class="note"><a class="pay-link" href="${escapeHtml(
        paymentLink,
      )}">${LABELS.paymentLink}</a></div>`
    : '';
  const signatureHtml = signature
    ? `<div class="signature"><img src="${signature}" alt="${LABELS.signature}"><div class="signature-label">${LABELS.signature}</div></div>`
    : '';

  const footerContact = [
    business.website ?? '',
    business.taxId ? `${LABELS.from} · ${business.taxId}` : '',
  ]
    .filter((value) => value !== '')
    .map((value) => escapeHtml(value))
    .join(' · ');

  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} ${escapeHtml(document.number ?? '')}</title>
<style>
  :root { --brand: ${color}; --on-brand: ${onBrand}; }
  @page { size: ${page.cssSize}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  body {
    color: #16211C;
    font-family: ${fonts.body};
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: ${page.width};
    min-height: ${page.height};
    padding: 12mm 14mm 10mm;
    display: flex;
    flex-direction: column;
    gap: 7mm;
  }
  h1, h2, h3, p { margin: 0; }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8mm;
  }
  .brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
  .brand-text { min-width: 0; }
  .logo {
    width: 22mm;
    height: 22mm;
    object-fit: contain;
    border-radius: 2mm;
    background: rgba(255, 255, 255, 0.16);
  }
  .logo-initial {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16pt;
    font-weight: 700;
    background: var(--brand);
    color: var(--on-brand);
  }
  .brand-name {
    font-family: ${fonts.heading};
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .brand-contact { color: #5C6B63; font-size: 9pt; margin-top: 1mm; overflow-wrap: anywhere; }
  .doc { text-align: right; }
  .doc-type {
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brand);
    font-weight: 700;
  }
  .doc-number { font-family: ${fonts.heading}; font-size: 19pt; font-weight: 700; }
  .stamp {
    display: inline-block;
    margin-top: 2mm;
    padding: 1mm 3mm;
    border: 0.5mm solid currentColor;
    border-radius: 1.5mm;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  .stamp-paid { color: #1F5F4A; }
  .stamp-overdue { color: #B3261E; }
  .stamp-void { color: #5C6B63; }
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 8mm;
    border-top: 0.4mm solid #E3DFD2;
    padding-top: 5mm;
  }
  .party { max-width: 95mm; }
  .party-label, .section-title {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #5C6B63;
    font-weight: 700;
    margin-bottom: 1.5mm;
  }
  .party-name { font-weight: 700; font-size: 11pt; }
  .party-details, .meta-value { color: #3E4B44; font-size: 9.5pt; overflow-wrap: anywhere; }
  .meta { min-width: 55mm; }
  .meta-row { display: flex; justify-content: space-between; gap: 6mm; padding: 0.8mm 0; }
  .meta-label { color: #5C6B63; font-size: 9pt; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead th {
    text-align: left;
    font-size: 8pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #5C6B63;
    border-bottom: 0.4mm solid var(--brand);
    padding: 0 2mm 2mm;
  }
  table.lines tbody td {
    padding: 2.5mm 2mm;
    border-bottom: 0.2mm solid #E3DFD2;
    vertical-align: top;
  }
  table.lines tbody tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 600; }
  .col-description { width: 48%; overflow-wrap: anywhere; }
  .summary { display: flex; justify-content: space-between; gap: 10mm; page-break-inside: avoid; }
  .summary-notes { flex: 1; display: flex; flex-direction: column; gap: 4mm; min-width: 0; }
  .note p { color: #3E4B44; font-size: 9.5pt; white-space: pre-wrap; overflow-wrap: anywhere; }
  .pay-link { color: var(--brand); font-weight: 600; text-decoration: none; }
  .payments { display: flex; flex-direction: column; gap: 1mm; }
  .payment { display: flex; justify-content: space-between; gap: 4mm; font-size: 9pt; color: #3E4B44; }
  .totals { width: 68mm; align-self: flex-start; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals th {
    text-align: left;
    font-weight: 400;
    color: #5C6B63;
    font-size: 9.5pt;
    padding: 1.2mm 0;
  }
  .totals td { padding: 1.2mm 0; font-size: 9.5pt; }
  .totals tr.grand th, .totals tr.grand td {
    border-top: 0.5mm solid var(--brand);
    padding-top: 2.5mm;
    font-weight: 700;
    font-size: 11pt;
    color: #16211C;
  }
  .totals tr.balance th, .totals tr.balance td {
    font-weight: 700;
    color: var(--brand);
    font-size: 11pt;
  }
  .signature { margin-top: 2mm; }
  .signature img { max-height: 18mm; max-width: 50mm; object-fit: contain; }
  .signature-label {
    margin-top: 1mm;
    border-top: 0.2mm solid #B9C2BC;
    padding-top: 1mm;
    font-size: 8pt;
    color: #5C6B63;
    width: 50mm;
  }
  footer {
    margin-top: auto;
    border-top: 0.2mm solid #E3DFD2;
    padding-top: 3mm;
    color: #7A857E;
    font-size: 8pt;
    display: flex;
    justify-content: space-between;
    gap: 6mm;
  }
  .template-modern .head {
    background: var(--brand);
    color: var(--on-brand);
    padding: 8mm;
    border-radius: 2mm;
  }
  .template-modern .brand-contact,
  .template-modern .doc-type { color: var(--on-brand); opacity: 0.9; }
  .template-modern .stamp { color: var(--on-brand); }
  .template-modern .logo-initial { background: rgba(255, 255, 255, 0.18); }
  .template-minimal .head { border-bottom: 0.4mm solid #E3DFD2; padding-bottom: 4mm; }
  .template-minimal .doc-type { color: #5C6B63; }
  .template-minimal .brand-name { font-size: 14pt; letter-spacing: 0.06em; text-transform: uppercase; }
  .layout-logo-right .head { flex-direction: row-reverse; }
  .layout-logo-right .doc { text-align: left; }
  .layout-centered .head { flex-direction: column; align-items: center; text-align: center; gap: 4mm; }
  .layout-centered .brand { flex-direction: column; text-align: center; }
  .layout-centered .doc { text-align: center; }
  .layout-centered .parties { flex-direction: column; }
  .layout-centered .meta { min-width: 0; width: 100%; }
  /* The in-app preview fits the screen; print and PDF keep the physical page. */
  @media screen {
    .page { width: 100%; min-height: 0; padding: 4mm; }
  }
</style>
</head>
<body class="template-${brand.template} layout-${brand.headerLayout}">
<div class="page">
  <header class="head">
    <div class="brand">
      ${logoTag}
      <div class="brand-text">
        <div class="brand-name">${escapeHtml(business.name)}</div>
        <div class="brand-contact">${businessContact}</div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-type">${escapeHtml(title)}</div>
      <div class="doc-number">${escapeHtml(document.number ?? LABELS.draft)}</div>
      ${stampFor(document.shownStatus)}
    </div>
  </header>

  <section class="parties">
    <div class="party">
      <div class="party-label">${LABELS.billTo}</div>
      <div class="party-name">${escapeHtml(client.name)}</div>
      <div class="party-details">${clientDetails}</div>
    </div>
    <div class="meta">
      ${metaRows
        .map(
          (row) =>
            `<div class="meta-row"><span class="meta-label">${row.label}</span><span class="meta-value">${escapeHtml(
              row.value,
            )}</span></div>`,
        )
        .join('')}
    </div>
  </section>

  <table class="lines">
    <thead>
      <tr>
        <th class="col-description">${LABELS.description}</th>
        <th class="num">${LABELS.quantity}</th>
        <th class="num">${LABELS.unitPrice}</th>
        ${hasLineDiscount ? `<th class="num">${LABELS.discount}</th>` : ''}
        <th class="num">${LABELS.amount}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="summary">
    <div class="summary-notes">
      ${notesHtml}
      ${termsHtml}
      ${instructionsHtml}
      ${linkHtml}
      ${paymentsHtml}
      ${signatureHtml}
    </div>
    <div class="totals">
      <table><tbody>${totalsHtml}</tbody></table>
    </div>
  </section>

  <footer>
    <div>${escapeHtml(business.name)} · ${escapeHtml(document.number ?? LABELS.draft)}</div>
    <div>${footerContact}</div>
  </footer>
</div>
</body>
</html>`;
}
