/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers';
import {
  applyD1Migrations,
  evictDurableObject,
  runInDurableObject,
} from 'cloudflare:test';
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env } from '../server/env';

const runtime = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
beforeAll(() => applyD1Migrations(runtime.DB, runtime.TEST_MIGRATIONS));
afterEach(() => vi.restoreAllMocks());
async function account() {
  const id = crypto.randomUUID(),
    now = Date.now();
  await runtime.DB.batch([
    runtime.DB.prepare(
      'INSERT INTO user (id,name,email,emailVerified,isAnonymous,createdAt,updatedAt) VALUES (?,?,?,1,0,?,?)',
    ).bind(id, 'CheckoutTester', `${id}@example.invalid`, now, now),
    runtime.DB.prepare(
      'INSERT INTO profiles (id,authId,username,createdAt,lastSeen,acceptedAt) VALUES (?,?,?,?,?,?)',
    ).bind(id, id, 'CheckoutTester', now, now, now),
  ]);
  return {
    id,
    request: (plan = 'basic', action = 'checkout') =>
      runtime.BILLING.get(runtime.BILLING.idFromName(id)).fetch(
        new Request(`https://billing/${action}`, {
          method: 'POST',
          headers: { 'X-Profile-Id': id },
          body: JSON.stringify({
            plan,
            interval: 'monthly',
            requestId: crypto.randomUUID(),
          }),
        }),
      ),
  };
}
type Session = {
  id: string;
  status: 'open' | 'expired' | 'complete';
  url: string;
  metadata: { attemptId: string };
  subscription: string | null;
};
function stripeFixture() {
  const state = {
    sessions: [] as Session[],
    subscriptions: [] as { id: string; status: string }[],
    customers: 0,
    lostResponse: false,
    completeOnExpire: false,
    creations: [] as string[],
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url),
      body = new URLSearchParams(
        new TextDecoder().decode(await request.arrayBuffer()),
      );
    if (url.origin !== 'https://api.stripe.com')
      throw new Error('Unexpected outgoing request');
    if (url.pathname === '/v1/customers') {
      state.customers++;
      return Response.json({ id: 'cus_fixture' });
    }
    if (url.pathname === '/v1/subscriptions')
      return Response.json({ data: state.subscriptions, has_more: false });
    if (url.pathname.startsWith('/v1/subscriptions/'))
      return Response.json(
        state.subscriptions.find((s) => url.pathname.endsWith(s.id)),
      );
    if (url.pathname === '/v1/checkout/sessions' && request.method === 'GET')
      return Response.json({ data: state.sessions, has_more: false });
    if (url.pathname === '/v1/checkout/sessions') {
      const attemptId = request.headers.get('Idempotency-Key')!;
      state.creations.push(attemptId);
      let session = state.sessions.find(
        (s) => s.metadata.attemptId === attemptId,
      );
      if (!session) {
        session = {
          id: `cs_${state.sessions.length + 1}`,
          status: 'open',
          url: `https://checkout.stripe.com/c/pay/${state.sessions.length + 1}`,
          metadata: { attemptId: body.get('metadata[attemptId]')! },
          subscription: null,
        };
        state.sessions.push(session);
      }
      if (state.lostResponse) {
        state.lostResponse = false;
        throw new TypeError('Simulated lost response after provider commit');
      }
      return Response.json(session);
    }
    const session = state.sessions.find(
      (s) => url.pathname.split('/')[4] === s.id,
    );
    if (session && url.pathname.endsWith('/expire')) {
      if (state.completeOnExpire) {
        session.status = 'complete';
        session.subscription = 'sub_fixture';
        state.subscriptions = [{ id: 'sub_fixture', status: 'active' }];
        return Response.json(
          {
            error: {
              type: 'invalid_request_error',
              message: 'The session is already complete.',
            },
          },
          { status: 400 },
        );
      }
      session.status = 'expired';
      return Response.json(session);
    }
    if (session) return Response.json(session);
    throw new Error('Unexpected Stripe operation ' + url.pathname);
  });
  return state;
}
it('two simultaneous checkout tabs share one session and plan changes expire the first session', async () => {
  const state = stripeFixture(),
    actor = await account();
  const responses = await Promise.all([actor.request(), actor.request()]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  expect(state.customers).toBe(1);
  expect(state.sessions).toHaveLength(1);
  expect((await actor.request('plus')).status).toBe(200);
  expect(state.sessions.map((s) => s.status)).toEqual(['expired', 'open']);
});
it('recovers a lost checkout response without creating another payable session', async () => {
  const state = stripeFixture(),
    actor = await account();
  state.lostResponse = true;
  const failed = await actor.request();
  expect(failed.status).toBe(502);
  await failed.text();
  expect(state.sessions).toHaveLength(1);
  await evictDurableObject(
    runtime.BILLING.get(runtime.BILLING.idFromName(actor.id)),
  );
  expect((await actor.request()).status).toBe(200);
  expect(state.creations).toHaveLength(1);
});
it('replaces an unresolved attempt only after its fixed expiration makes creation impossible', async () => {
  const state = stripeFixture(),
    actor = await account();
  state.lostResponse = true;
  expect((await actor.request()).status).toBe(502);
  // Simulate a request that never reached Stripe, beyond its recovery window.
  state.sessions.length = 0;
  await runInDurableObject(
    runtime.BILLING.get(runtime.BILLING.idFromName(actor.id)),
    async (_instance, durableState) => {
      const pending = await durableState.storage.get<{
        createdAt: number;
        params: { expires_at: number };
      }>('checkout');
      if (!pending) throw new Error('Expected a durable checkout attempt');
      pending.createdAt = Math.floor(Date.now() / 1000) - 4000;
      pending.params.expires_at = pending.createdAt + 3600;
      await durableState.storage.put('checkout', pending);
    },
  );
  expect((await actor.request()).status).toBe(200);
  expect(new Set(state.creations).size).toBe(2);
  expect(state.sessions).toHaveLength(1);
});
it('allows a new checkout after an earlier completed subscription has been canceled', async () => {
  const state = stripeFixture(),
    actor = await account();
  expect((await actor.request()).status).toBe(200);
  state.sessions[0].status = 'complete';
  state.sessions[0].subscription = 'sub_old';
  state.subscriptions = [{ id: 'sub_old', status: 'canceled' }];
  expect((await actor.request('plus')).status).toBe(200);
  expect(state.sessions.map((s) => s.status)).toEqual(['complete', 'open']);
});
it('a payment completing during plan switching blocks a second subscription before webhook delivery', async () => {
  const state = stripeFixture(),
    actor = await account();
  expect((await actor.request()).status).toBe(200);
  state.completeOnExpire = true;
  expect((await actor.request('plus')).status).toBe(502);
  expect((await actor.request('plus')).status).toBe(409);
  expect((await actor.request('basic', 'close')).status).toBe(409);
  expect(state.sessions).toHaveLength(1);
  expect(
    await runtime.DB.prepare('SELECT id FROM subscriptions WHERE profileId=?')
      .bind(actor.id)
      .first(),
  ).toBeNull();
});
it('deletion closes unpaid checkout and prevents a racing new checkout', async () => {
  const state = stripeFixture(),
    actor = await account();
  expect((await actor.request()).status).toBe(200);
  expect((await actor.request('basic', 'close')).status).toBe(200);
  expect(state.sessions[0].status).toBe('expired');
  expect((await actor.request()).status).toBe(409);
  expect(state.sessions).toHaveLength(1);
});
