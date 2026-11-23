import { describe, expect, it } from 'vitest';
import { renderInvoiceHtml, type RenderInvoiceInput } from '../src/renderer.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function input(overrides: Partial<RenderInvoiceInput> = {}): RenderInvoiceInput {
  return {
    document: {
      docType: 'invoice',
      number: 'INV-0001',
      shownStatus: 'sent',
      issueDate: '2026-11-01',
      dueDate: '2026-11-15',
      reference: 'PO-42',
      currency: 'USD',
      taxMode: 'added',
      taxRateBp: 1000,
      items: [
        { description: 'Design work', quantity: 1, unitPrice: 10000 },
        { description: 'Consultation', quantity: 2, unitPrice: 2500 },
      ],
      payments: [],
    },
    business: {
      name: 'Amina Studio',
      email: 'hello@amina.studio',
      phone: '+1 555 0100',
      address: '12 Market Street',
      website: 'https://amina.studio',
    },
    client: { name: 'Acme Trading', email: 'ap@acme.test' },
    brand: {
      color: '#1F5F4A',
      template: 'classic',
      headerLayout: 'logo-left',
      pageSize: 'A4',
      language: 'en',
    },
    ...overrides,
  };
}

describe('renderInvoiceHtml', () => {
  it('computes and prints the totals from the shared function', () => {
    const html = renderInvoiceHtml(input());
    // 10000 + 5000 = 15000 subtotal, 10% tax = 1500, total 16500.
    expect(html).toContain('150.00');
    expect(html).toContain('165.00');
    expect(html).toContain('INV-0001');
    expect(html).toContain('Acme Trading');
  });

  it('applies an invoice discount before tax', () => {
    const html = renderInvoiceHtml(
      input({
        document: {
          ...input().document,
          discount: { type: 'percent', valueBp: 1000 },
          taxRateBp: 0,
        },
      }),
    );
    expect(html).toContain('150.00');
    expect(html).toContain('-$15.00');
    expect(html).toContain('135.00');
  });

  it('takes included tax out of the total instead of adding it', () => {
    const html = renderInvoiceHtml(
      input({
        document: {
          ...input().document,
          items: [{ description: 'Retainer', quantity: 1, unitPrice: 12000 }],
          taxMode: 'included',
          taxRateBp: 2000,
        },
      }),
    );
    expect(html).toContain('120.00');
    expect(html).toContain('Tax (included)');
    expect(html).toContain('20.00');
  });

  it('uses the page size from the brand', () => {
    const a4 = renderInvoiceHtml(input());
    expect(a4).toContain('@page { size: A4; margin: 0; }');

    const letter = renderInvoiceHtml(input({ brand: { ...input().brand, pageSize: 'LETTER' } }));
    expect(letter).toContain('@page { size: letter; margin: 0; }');
    expect(letter).toContain('width: 216mm');
  });

  it('marks the template and header layout on the page', () => {
    const html = renderInvoiceHtml(
      input({ brand: { ...input().brand, template: 'modern', headerLayout: 'centered' } }),
    );
    expect(html).toContain('class="template-modern layout-centered"');
  });

  it('escapes every value that came from a user', () => {
    const html = renderInvoiceHtml(
      input({
        client: { name: '<img src=x onerror=alert(1)>', email: 'a&b@example.com' },
        business: { name: 'Studio <script>alert(2)</script>' },
        document: {
          ...input().document,
          notes: '</style><script>alert(3)</script>',
          items: [{ description: '<b>Bold</b>', quantity: 1, unitPrice: 100 }],
        },
      }),
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&amp;b@example.com');
  });

  it('only embeds PNG or JPEG data URLs and https payment links', () => {
    const unsafe = renderInvoiceHtml(
      input({
        brand: {
          ...input().brand,
          logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          signatureDataUrl: 'javascript:alert(1)',
          paymentLink: 'javascript:alert(1)',
          paymentInstructions: 'Pay by transfer',
        },
      }),
    );
    expect(unsafe).not.toContain('data:image/svg+xml');
    expect(unsafe).not.toContain('javascript:alert');
    expect(unsafe).not.toContain('class="pay-link"');
    expect(unsafe).toContain('Pay by transfer');

    const safe = renderInvoiceHtml(
      input({
        brand: {
          ...input().brand,
          logoDataUrl: PNG,
          signatureDataUrl: PNG,
          paymentLink: 'https://pay.example.com/inv-1?a=1&b=2',
        },
      }),
    );
    expect(safe).toContain(`src="${PNG}"`);
    expect(safe).toContain('class="pay-link"');
    expect(safe).toContain('href="https://pay.example.com/inv-1?a=1&amp;b=2"');
    expect(safe).toContain('signature');
  });

  it('falls back to the default colour when the brand colour is not a hex value', () => {
    const html = renderInvoiceHtml(
      input({ brand: { ...input().brand, color: 'red; background: url(x)' } }),
    );
    expect(html).toContain('--brand: #1F5F4A');
    expect(html).not.toContain('url(x)');
  });

  it('stamps paid, overdue and void documents', () => {
    const paid = renderInvoiceHtml(
      input({
        document: {
          ...input().document,
          shownStatus: 'paid',
          payments: [{ amount: 16500, method: 'cash', paidAt: '2026-11-10T10:00:00.000Z' }],
        },
      }),
    );
    expect(paid).toContain('stamp-paid');
    expect(paid).toContain('Balance due');

    expect(
      renderInvoiceHtml(input({ document: { ...input().document, shownStatus: 'overdue' } })),
    ).toContain('stamp-overdue');
    expect(
      renderInvoiceHtml(input({ document: { ...input().document, shownStatus: 'void' } })),
    ).toContain('stamp-void');
  });

  it('shows a discount column only when a line has one', () => {
    const without = renderInvoiceHtml(input());
    expect(without).not.toContain('<th class="num">Discount</th>');

    const withLineDiscount = renderInvoiceHtml(
      input({
        document: {
          ...input().document,
          items: [{ description: 'Design', quantity: 1, unitPrice: 10000, discountBp: 1500 }],
        },
      }),
    );
    expect(withLineDiscount).toContain('<th class="num">Discount</th>');
    expect(withLineDiscount).toContain('15%');
  });

  it('uses the estimate labels and validity date for an estimate', () => {
    const html = renderInvoiceHtml(
      input({
        document: {
          ...input().document,
          docType: 'estimate',
          number: 'EST-0003',
          validUntil: '2026-12-01',
          dueDate: null,
        },
      }),
    );
    expect(html).toContain('Estimate');
    expect(html).toContain('Valid until');
    expect(html).toContain('EST-0003');
  });
});
