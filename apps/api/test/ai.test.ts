import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  randomSuffix,
  registerAccount,
  resetTestDb,
  type TestAccount,
  type TestApp,
} from './helpers.js';
import { Document } from '../src/models/document.js';
import { Membership } from '../src/models/membership.js';

function geminiReply(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubGemini(text: string) {
  const mock = vi.fn(async () => geminiReply(text));
  vi.stubGlobal('fetch', mock);
  return mock;
}

const GOOD_REPLY = JSON.stringify({
  clientName: 'Acme Trading',
  items: [
    { description: 'Design work', quantity: 3, unitPrice: 450.5 },
    { description: 'Hosting', quantity: 1, unitPrice: 120, unit: 'month' },
  ],
  discountPercent: 5,
  taxPercent: 10,
  notes: 'Draft from your description',
});

describe('AI drafting', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp({ geminiApiKey: 'test-gemini-key', aiDailyLimit: 5 });
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    vi.unstubAllGlobals();
    owner = await registerAccount(testApp.request, { businessName: 'AI Studio' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('turns the reply into minor units, a percent discount and a tax rate', async () => {
    const fetchMock = stubGemini(GOOD_REPLY);

    const response = await testApp.request().post('/api/v1/ai/draft').set(headersFor(owner)).send({
      prompt:
        'Invoice Acme for 3 days of design at 450.50 and hosting 120, mail accounts@acme.test',
    });

    expect(response.status).toBe(200);
    expect(response.body.draft.items[0]).toMatchObject({
      description: 'Design work',
      quantity: 3,
      unitPrice: 45050,
    });
    expect(response.body.draft.items[1].unit).toBe('month');
    expect(response.body.draft.currency).toBe('USD');
    expect(response.body.draft.discount).toEqual({ type: 'percent', valueBp: 500 });
    expect(response.body.draft.taxRateBp).toBe(1000);
    expect(response.body.remaining).toBe(4);

    // The assistant never writes a document.
    expect(await Document.countDocuments()).toBe(0);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('gemini-2.5-flash:generateContent');
    const headers = call[1].headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-gemini-key');
    const body = JSON.parse(String(call[1].body)) as {
      contents: { parts: { text: string }[] }[];
    };
    const sent = body.contents[0]?.parts[0]?.text ?? '';
    expect(sent).not.toContain('accounts@acme.test');
    expect(sent).toContain('[email removed]');
    expect(sent).toContain('3 days of design');
  });

  it('rejects an unreadable reply without recording usage', async () => {
    stubGemini('I cannot help with that.');
    const first = await testApp
      .request()
      .post('/api/v1/ai/draft')
      .set(headersFor(owner))
      .send({ prompt: 'Design work for Acme' });

    expect(first.status).toBe(502);
    expect(first.body.error.code).toBe('AI_FAILED');

    // The failed attempt was refunded, so a good attempt still fits in the cap.
    stubGemini(GOOD_REPLY);
    const second = await testApp
      .request()
      .post('/api/v1/ai/draft')
      .set(headersFor(owner))
      .send({ prompt: 'Design work for Acme' });
    expect(second.status).toBe(200);
    expect(second.body.remaining).toBe(4);
  });

  it('reports a missing Gemini key instead of calling out', async () => {
    const noKey = await makeApp({ geminiApiKey: undefined });
    try {
      const account = await registerAccount(noKey.request, { businessName: 'No Key Ltd' });
      const mock = stubGemini(GOOD_REPLY);
      const response = await noKey
        .request()
        .post('/api/v1/ai/draft')
        .set(headersFor(account))
        .send({ prompt: 'Design work for Acme' });

      expect(response.status).toBe(502);
      expect(response.body.error.message).toContain('not set up');
      expect(mock).not.toHaveBeenCalled();
    } finally {
      await noKey.app.close();
    }
  });

  it('enforces the daily cap per user', async () => {
    const capped = await makeApp({ geminiApiKey: 'test-gemini-key', aiDailyLimit: 1 });
    try {
      const account = await registerAccount(capped.request, { businessName: 'Capped Ltd' });
      const fetchMock = stubGemini(GOOD_REPLY);

      const first = await capped
        .request()
        .post('/api/v1/ai/draft')
        .set(headersFor(account))
        .send({ prompt: 'Design work for Acme' });
      expect(first.status).toBe(200);
      expect(first.body.remaining).toBe(0);

      const second = await capped
        .request()
        .post('/api/v1/ai/draft')
        .set(headersFor(account))
        .send({ prompt: 'More work for Acme' });
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('AI_QUOTA');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await capped.app.close();
    }
  });

  it('forbids a viewer and requires a business membership', async () => {
    const viewer = await registerAccount(testApp.request, {
      businessName: 'Viewer AI Ltd',
      email: `viewer-${randomSuffix()}@example.com`,
    });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });

    const response = await testApp
      .request()
      .post('/api/v1/ai/draft')
      .set(headersFor(viewer, owner.businessId))
      .send({ prompt: 'Design work for Acme' });

    expect(response.status).toBe(403);
  });

  it('validates the prompt before calling the assistant', async () => {
    const mock = stubGemini(GOOD_REPLY);
    const response = await testApp
      .request()
      .post('/api/v1/ai/draft')
      .set(headersFor(owner))
      .send({ prompt: ' ' });

    expect(response.status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
});
