/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers';
import {
  applyD1Migrations,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import worker from '../server/worker';
import type { Env } from '../server/env';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { validProxySecret } from '../server/data';

const runtime = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
beforeAll(async () => {
  await applyD1Migrations(runtime.DB, runtime.TEST_MIGRATIONS);
});
afterEach(() => vi.restoreAllMocks());
async function call(
  path: string,
  body?: unknown,
  cookie = '',
  override: Partial<Env> = {},
) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`http://localhost:3000/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Forwarded-For': crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { ...runtime, ...override },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
function cookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
it('validates the private proxy secret inside the Worker runtime', async () => {
  const secret = 'fixture-private-proxy-secret';
  expect(await validProxySecret(secret, secret)).toBe(true);
  for (const supplied of [null, '', 'wrong', secret + 'x', 'x'.repeat(257)]) {
    expect(await validProxySecret(supplied, secret)).toBe(false);
  }
  expect(
    (await call('/config', undefined, '', { API_PROXY_KEY: secret })).status,
  ).toBe(403);
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request('http://localhost:3000/api/config', {
      headers: { 'X-Elsewhere-Proxy': secret },
    }),
    { ...runtime, API_PROXY_KEY: secret },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
});
it('email verification upgrades a guest and retains the same profile', async () => {
  const outgoing: { to: string[]; text: string }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== 'https://api.resend.com/emails')
      throw new Error('Unexpected outgoing request ' + url);
    if (typeof options?.body !== 'string')
      throw new Error('Expected a serialized email payload.');
    outgoing.push(JSON.parse(options.body));
    return Response.json({ id: 'mock-email' });
  });
  const emailEnv = {
    RESEND_API_KEY: 'test-not-a-real-key',
    EMAIL_FROM: 'Elsewhere <test@example.invalid>',
  };
  const guest = await call('/auth/sign-in/anonymous', {});
  const guestCookie = cookie(guest);
  const before = (await (await call('/me', undefined, guestCookie)).json()) as {
    id: string;
    guest: boolean;
  };
  const signup = await call(
    '/auth/sign-up/email',
    {
      name: 'EmailTester',
      email: `${crypto.randomUUID()}@example.invalid`,
      password: 'this-is-a-test-password-123',
      callbackURL: 'http://localhost:3000/chat',
    },
    guestCookie,
    emailEnv,
  );
  expect(signup.status).toBe(200);
  expect(outgoing).toHaveLength(1);
  const url = outgoing[0].text.match(/https?:\/\/\S+/)![0];
  const verifyPath =
    new URL(url).pathname.replace('/api', '') + new URL(url).search;
  const verified = await call(verifyPath, undefined, guestCookie, emailEnv);
  expect([200, 302]).toContain(verified.status);
  const nextCookie = cookie(verified);
  expect(nextCookie).toContain('session_token');
  const after = (await (
    await call('/me', undefined, nextCookie, emailEnv)
  ).json()) as { id: string; guest: boolean };
  expect(after.id).toBe(before.id);
  expect(after.guest).toBe(false);
  expect((await call('/me', undefined, guestCookie)).status).toBe(401);
});
it('Stripe accepts signed events, ignores replays, and does not revoke a newer subscription', async () => {
  const profileId = crypto.randomUUID(),
    userId = crypto.randomUUID();
  await runtime.DB.batch([
    runtime.DB.prepare(
      'INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
    ).bind(
      userId,
      'BillingTester',
      `${userId}@example.invalid`,
      Date.now(),
      Date.now(),
    ),
    runtime.DB.prepare(
      'INSERT INTO profiles (id,authId,username,createdAt,lastSeen,stripeCustomerId) VALUES (?,?,?,?,?,?)',
    ).bind(
      profileId,
      userId,
      'BillingTester',
      Date.now(),
      Date.now(),
      'cus_test',
    ),
  ]);
  const billingEnv = {
    ...runtime,
    STRIPE_SECRET_KEY: 'sk_test_local_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture',
    STRIPE_BASIC_MONTHLY: 'price_basic',
    STRIPE_PLUS_MONTHLY: 'price_plus',
  };
  const subscriptions: Record<string, object> = {
    sub_new: {
      id: 'sub_new',
      customer: 'cus_test',
      metadata: { profileId },
      status: 'active',
      items: {
        data: [{ price: { id: 'price_plus' }, current_period_end: 2000000000 }],
      },
    },
    sub_old: {
      id: 'sub_old',
      customer: 'cus_test',
      metadata: { profileId },
      status: 'canceled',
      items: {
        data: [
          { price: { id: 'price_basic' }, current_period_end: 1000000000 },
        ],
      },
    },
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const id = url.split('/').at(-1)!;
    if (!subscriptions[id]) throw new Error('Unexpected request ' + url);
    return Response.json(subscriptions[id]);
  });
  const stripe = new Stripe(billingEnv.STRIPE_SECRET_KEY);
  async function deliver(id: string, subscriptionId: string, type: string) {
    const body = JSON.stringify({
      id,
      object: 'event',
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object: subscriptions[subscriptionId] },
    });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: billingEnv.STRIPE_WEBHOOK_SECRET,
      cryptoProvider: Stripe.createSubtleCryptoProvider(),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('https://backend.invalid/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body,
      }),
      billingEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
  }
  expect(
    (await deliver('evt_new', 'sub_new', 'customer.subscription.created'))
      .status,
  ).toBe(200);
  expect(
    (
      await runtime.DB.prepare('SELECT plan FROM profiles WHERE id=?')
        .bind(profileId)
        .first<{ plan: string }>()
    )?.plan,
  ).toBe('plus');
  expect(
    (await deliver('evt_old', 'sub_old', 'customer.subscription.deleted'))
      .status,
  ).toBe(200);
  expect(
    (
      await runtime.DB.prepare('SELECT plan FROM profiles WHERE id=?')
        .bind(profileId)
        .first<{ plan: string }>()
    )?.plan,
  ).toBe('plus');
  expect(
    (await deliver('evt_new', 'sub_new', 'customer.subscription.created'))
      .status,
  ).toBe(200);
  expect(
    (
      await runtime.DB.prepare(
        'SELECT COUNT(*) AS count FROM billingEvents',
      ).first<{ count: number }>()
    )?.count,
  ).toBe(2);
  const invalid = await call(
    '/billing/webhook',
    { id: 'forged' },
    '',
    billingEnv,
  );
  expect(invalid.status).toBe(400);
});
it('moderation decisions and support responses enforce role boundaries', async () => {
  const guest = await call('/auth/sign-in/anonymous', {}),
    authCookie = cookie(guest);
  const profile = (await (await call('/me', undefined, authCookie)).json()) as {
    id: string;
  };
  const auth = await runtime.DB.prepare(
    'SELECT authId FROM profiles WHERE id=?',
  )
    .bind(profile.id)
    .first<{ authId: string }>();
  const ticket = (await (
    await call(
      '/support',
      { category: 'help', message: 'A test support request.' },
      authCookie,
    )
  ).json()) as { id: string };
  expect((await call('/admin/support', undefined, authCookie)).status).toBe(
    403,
  );
  const admin = { ADMIN_USER_IDS: auth!.authId };
  expect(
    (await call('/admin/support', undefined, authCookie, admin)).status,
  ).toBe(200);
  expect(
    (
      await call(
        '/admin/support/respond',
        { id: ticket.id, response: 'This is a test reply.' },
        authCookie,
        admin,
      )
    ).status,
  ).toBe(200);
  const tickets = (await (
    await call('/support', undefined, authCookie)
  ).json()) as { status: string; response: string }[];
  expect(tickets[0]).toMatchObject({
    status: 'resolved',
    response: 'This is a test reply.',
  });
  expect(
    (
      await runtime.DB.prepare(
        'SELECT COUNT(*) AS count FROM moderationAudit WHERE profileId=?',
      )
        .bind(profile.id)
        .first<{ count: number }>()
    )?.count,
  ).toBe(1);
});
