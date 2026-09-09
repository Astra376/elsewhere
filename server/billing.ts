import Stripe from 'stripe';
import { ApiError, json, limit, type RowProfile } from './data';
import type { Env } from './env';
import type { Plan } from '../lib/domain';

export function prices(env: Env) {
  return {
    basic: {
      monthly: env.STRIPE_BASIC_MONTHLY,
      yearly: env.STRIPE_BASIC_YEARLY,
    },
    plus: { monthly: env.STRIPE_PLUS_MONTHLY, yearly: env.STRIPE_PLUS_YEARLY },
  };
}
export async function billing(
  request: Request,
  env: Env,
  profile: RowProfile | null,
) {
  if (!env.STRIPE_SECRET_KEY)
    throw new ApiError(
      503,
      'Membership checkout is not open yet. You can keep chatting for free.',
      'not_configured',
    );
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
  const path = new URL(request.url).pathname;
  if (path === '/api/billing/webhook') {
    if (!env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError(503, 'Billing webhook is not configured.');
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new ApiError(400, 'Missing webhook signature.');
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        await request.text(),
        signature,
        env.STRIPE_WEBHOOK_SECRET,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      throw new ApiError(400, 'Invalid webhook signature.');
    }
    if (
      await env.DB.prepare('SELECT id FROM billingEvents WHERE id=?')
        .bind(event.id)
        .first()
    )
      return json({ received: true });
    if (
      [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ].includes(event.type)
    ) {
      const payload = event.data.object as Stripe.Subscription;
      // Retrieve current state: webhook delivery order is not authoritative.
      const subscription = await stripe.subscriptions.retrieve(payload.id);
      const profileId = subscription.metadata.profileId;
      if (profileId) {
        const owner = await env.DB.prepare(
          'SELECT id,stripeCustomerId FROM profiles WHERE id=?',
        )
          .bind(profileId)
          .first<{ id: string; stripeCustomerId: string | null }>();
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        if (owner?.stripeCustomerId === customerId) {
          const price = subscription.items.data[0]?.price.id;
          const map = prices(env);
          let plan: Plan = 'free';
          if (['active', 'trialing'].includes(subscription.status)) {
            if (price === map.plus.monthly || price === map.plus.yearly)
              plan = 'plus';
            else if (price === map.basic.monthly || price === map.basic.yearly)
              plan = 'basic';
          }
          await env.DB.batch([
            env.DB.prepare(
              'INSERT INTO subscriptions (id,profileId,plan,status,periodEnd,updatedAt) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET plan=excluded.plan,status=excluded.status,periodEnd=excluded.periodEnd,updatedAt=excluded.updatedAt',
            ).bind(
              subscription.id,
              profileId,
              plan,
              subscription.status,
              subscription.items.data[0]?.current_period_end ?? null,
              Date.now(),
            ),
            // A delayed cancellation from an older subscription must not revoke a newer one.
            env.DB.prepare(
              "UPDATE profiles SET plan=COALESCE((SELECT plan FROM subscriptions WHERE profileId=? AND status IN ('active','trialing') ORDER BY CASE plan WHEN 'plus' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END DESC LIMIT 1),'free') WHERE id=?",
            ).bind(profileId, profileId),
          ]);
        }
      }
    }
    await env.DB.prepare(
      'INSERT INTO billingEvents (id,createdAt) VALUES (?,?) ON CONFLICT(id) DO NOTHING',
    )
      .bind(event.id, Date.now())
      .run();
    return json({ received: true });
  }
  if (!profile) throw new ApiError(401, 'Sign in first.');
  await limit(env, `billing:${profile.id}`, 8);
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.');
  const user = await env.DB.prepare(
    'SELECT email,isAnonymous,emailVerified FROM user WHERE id=?',
  )
    .bind(profile.authId)
    .first<{ email: string; isAnonymous: boolean; emailVerified: boolean }>();
  if (!user || user.isAnonymous || !user.emailVerified)
    throw new ApiError(
      403,
      'Create and verify an account before choosing a paid plan.',
      'account_required',
    );
  if (path === '/api/billing/portal') {
    if (!profile.stripeCustomerId)
      throw new ApiError(404, 'You do not have a billing account yet.');
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${env.APP_ORIGIN}/chat?view=plans`,
    });
    return json({ url: portal.url });
  }
  if (path === '/api/billing/checkout') {
    return env.BILLING.get(env.BILLING.idFromName(profile.id)).fetch(
      new Request('https://billing/checkout', {
        method: 'POST',
        headers: { 'X-Profile-Id': profile.id },
        body: await request.text(),
      }),
    );
  }
  throw new ApiError(404, 'Billing action not found.');
}
