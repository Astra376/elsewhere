import { DurableObject } from 'cloudflare:workers';
import Stripe from 'stripe';
import { z } from 'zod';
import { ApiError, getProfile, json } from './data';
import { prices } from './billing';
import type { Env } from './env';

type Attempt = {
  id: string;
  price: string;
  createdAt: number;
  params: Stripe.Checkout.SessionCreateParams;
  sessionId?: string;
};
const inactive = new Set(['canceled', 'incomplete_expired']);
const membershipExists = () =>
  new ApiError(
    409,
    'Manage your existing or pending membership in the billing portal.',
  );

// One object per profile serializes checkout tabs and account deletion. Persist
// Stripe parameters before sending: an interrupted request can safely resume.
export class BillingCoordinator extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  fetch(request: Request) {
    const result = this.tail.then(() => this.handle(request));
    this.tail = result.catch(() => {});
    return result;
  }
  private async resume(stripe: Stripe, attempt: Attempt) {
    if (attempt.sessionId)
      return stripe.checkout.sessions.retrieve(attempt.sessionId);
    // Recover a response lost after Stripe committed it, including after its
    // idempotency cache expires. No new attempts exist until this one resolves.
    if (typeof attempt.params.customer !== 'string')
      throw new ApiError(503, 'Checkout customer could not be verified.');
    const recent = await stripe.checkout.sessions.list({
      customer: attempt.params.customer,
      created: { gte: attempt.createdAt - 60 },
      limit: 100,
    });
    const found = recent.data.find(
      (session) => session.metadata?.attemptId === attempt.id,
    );
    if (found) {
      await this.ctx.storage.put('checkout', {
        ...attempt,
        sessionId: found.id,
      });
      return found;
    }
    if (recent.has_more)
      throw new ApiError(
        503,
        'Checkout could not be verified. Please contact support.',
      );
    // The fixed expiry is now too close for Stripe to create this old request.
    // It cannot become payable later, so a fresh attempt can safely replace it.
    if (Date.now() / 1000 >= (attempt.params.expires_at ?? 0) - 1800)
      return null;
    const session = await stripe.checkout.sessions.create(attempt.params, {
      idempotencyKey: attempt.id,
    });
    await this.ctx.storage.put('checkout', {
      ...attempt,
      sessionId: session.id,
    });
    return session;
  }
  private async handle(request: Request) {
    let stage = 'initialize';
    try {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST' || !['/checkout', '/close'].includes(path))
        throw new ApiError(404, 'Billing action not found.');
      const profile = await getProfile(
        this.env,
        request.headers.get('X-Profile-Id') ?? '',
      );
      if (path === '/checkout' && (await this.ctx.storage.get('closed')))
        throw new ApiError(
          409,
          'Account deletion has started. Finish deleting this account before creating another.',
        );
      if (!this.env.STRIPE_SECRET_KEY)
        throw new ApiError(
          503,
          'Billing verification is temporarily unavailable.',
        );
      stage = 'stripe_client';
      const stripe = new Stripe(this.env.STRIPE_SECRET_KEY, {
        httpClient: Stripe.createFetchHttpClient(),
        timeout: 8000,
        maxNetworkRetries: 0,
      });
      const data =
        path === '/checkout'
          ? z
              .object({
                plan: z.enum(['basic', 'plus']),
                interval: z.enum(['monthly', 'yearly']),
              })
              .parse(await request.json())
          : null;
      const price = data
        ? prices(this.env)[data.plan][data.interval]
        : undefined;
      if (data && !price)
        throw new ApiError(
          503,
          'This membership is not available yet.',
          'not_configured',
        );
      const user = await this.env.DB.prepare(
        'SELECT email,isAnonymous,emailVerified FROM user WHERE id=?',
      )
        .bind(profile.authId)
        .first<{
          email: string;
          isAnonymous: boolean;
          emailVerified: boolean;
        }>();
      if (data && (!user || user.isAnonymous || !user.emailVerified))
        throw new ApiError(
          403,
          'Create and verify an account before choosing a paid plan.',
          'account_required',
        );
      let customer = profile.stripeCustomerId;
      if (!customer && data && user) {
        stage = 'create_customer';
        const created = await stripe.customers.create(
          { email: user.email, metadata: { profileId: profile.id } },
          { idempotencyKey: `customer:${profile.id}` },
        );
        customer = created.id;
        await this.env.DB.prepare(
          'UPDATE profiles SET stripeCustomerId=? WHERE id=?',
        )
          .bind(customer, profile.id)
          .run();
      }
      stage = 'recover_checkout';
      const attempt = await this.ctx.storage.get<Attempt>('checkout');
      const pending = attempt ? await this.resume(stripe, attempt) : null;
      if (
        pending &&
        !['open', 'complete', 'expired'].includes(pending.status ?? '')
      )
        throw new ApiError(
          503,
          'Checkout status could not be verified. Please try again.',
        );
      if (pending?.status === 'complete') {
        const subscriptionId =
          typeof pending.subscription === 'string'
            ? pending.subscription
            : pending.subscription?.id;
        if (
          !subscriptionId ||
          !inactive.has(
            (await stripe.subscriptions.retrieve(subscriptionId)).status,
          )
        )
          throw membershipExists();
      }
      if (customer) {
        stage = 'list_subscriptions';
        const subscriptions = await stripe.subscriptions.list({
          customer,
          status: 'all',
          limit: 100,
        });
        if (
          subscriptions.has_more ||
          subscriptions.data.some((s) => !inactive.has(s.status))
        )
          throw membershipExists();
      }
      if (pending?.status === 'open') {
        if (data && attempt?.price === price && pending.url)
          return json({ url: pending.url });
        // If payment wins this race Stripe refuses expiration. Fail closed and
        // retrieve authoritative subscription state on the next attempt.
        await stripe.checkout.sessions.expire(pending.id);
      }
      await this.ctx.storage.delete('checkout');
      if (path === '/close') {
        await this.ctx.storage.put('closed', true);
        return json({ ok: true });
      }
      if (!customer || !price)
        throw new ApiError(503, 'Checkout is unavailable.');
      const createdAt = Math.floor(Date.now() / 1000),
        id = crypto.randomUUID();
      const next: Attempt = {
        id,
        price,
        createdAt,
        params: {
          mode: 'subscription',
          customer,
          line_items: [{ price, quantity: 1 }],
          client_reference_id: profile.id,
          subscription_data: { metadata: { profileId: profile.id } },
          metadata: { attemptId: id },
          expires_at: createdAt + 3600,
          success_url: `${this.env.APP_ORIGIN}/chat?view=plans&checkout=success`,
          cancel_url: `${this.env.APP_ORIGIN}/chat?view=plans&checkout=cancelled`,
          allow_promotion_codes: true,
        },
      };
      await this.ctx.storage.put('checkout', next);
      stage = 'create_checkout';
      const checkout = await stripe.checkout.sessions.create(next.params, {
        idempotencyKey: id,
      });
      await this.ctx.storage.put('checkout', {
        ...next,
        sessionId: checkout.id,
      });
      return json({ url: checkout.url });
    } catch (error) {
      if (!(error instanceof ApiError) && !(error instanceof z.ZodError)) {
        const diagnostic = error as {
          name?: string;
          type?: string;
          code?: string;
          statusCode?: number;
          requestId?: string;
        };
        console.error('billing_checkout_failed', {
          stage,
          name: diagnostic?.name,
          type: diagnostic?.type,
          code: diagnostic?.code,
          status: diagnostic?.statusCode,
          requestId: diagnostic?.requestId,
        });
      }
      return json(
        {
          error:
            error instanceof ApiError
              ? error.message
              : 'Checkout could not be confirmed. Please try again; your existing checkout will be recovered.',
        },
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 502,
      );
    }
  }
}
