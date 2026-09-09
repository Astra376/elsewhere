import webPush from 'web-push';
import { z } from 'zod';
import { ApiError, json, limit, type RowProfile } from './data';
import type { Env } from './env';

export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === '443') &&
      (u.hostname === 'fcm.googleapis.com' ||
        u.hostname === 'updates.push.services.mozilla.com' ||
        u.hostname.endsWith('.push.apple.com') ||
        u.hostname.endsWith('.notify.windows.com') ||
        u.hostname.endsWith('.wns.windows.com'))
    );
  } catch {
    return false;
  }
}
export async function pushRoute(
  request: Request,
  env: Env,
  profile: RowProfile,
) {
  await limit(env, `push:${profile.id}`, 12);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
    throw new ApiError(503, 'Push notifications are not available yet.');
  if (request.method === 'DELETE') {
    const { endpoint } = z
      .object({ endpoint: z.string().max(2000) })
      .parse(await request.json());
    await env.DB.prepare(
      'DELETE FROM pushSubscriptions WHERE profileId=? AND endpoint=?',
    )
      .bind(profile.id, endpoint)
      .run();
    return json({ ok: true });
  }
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST or DELETE.');
  const data = z
    .object({
      endpoint: z
        .string()
        .max(2000)
        .refine(validPushEndpoint, 'Unsupported push service.'),
      keys: z.object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      }),
    })
    .parse(await request.json());
  const existing = await env.DB.prepare(
    'SELECT profileId FROM pushSubscriptions WHERE endpoint=?',
  )
    .bind(data.endpoint)
    .first<{ profileId: string }>();
  if (existing && existing.profileId !== profile.id)
    throw new ApiError(
      409,
      'Reset this browser’s notification permission before switching accounts.',
    );
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM pushSubscriptions WHERE profileId=?',
  )
    .bind(profile.id)
    .first<{ count: number }>();
  if (!existing && (count?.count ?? 0) >= 5)
    throw new ApiError(
      409,
      'Notifications are already connected on five devices.',
    );
  await env.DB.prepare(
    'INSERT INTO pushSubscriptions (id,profileId,endpoint,p256dh,auth,createdAt) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth',
  )
    .bind(
      crypto.randomUUID(),
      profile.id,
      data.endpoint,
      data.keys.p256dh,
      data.keys.auth,
      Date.now(),
    )
    .run();
  return json({ ok: true });
}
export async function deliverPush(
  env: Env,
  profileId: string,
  type: string,
  targetId?: string,
) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  const profile = await env.DB.prepare('SELECT prefs FROM profiles WHERE id=?')
    .bind(profileId)
    .first<{ prefs: string }>();
  if (!profile || !JSON.parse(profile.prefs).push) return;
  const rows = await env.DB.prepare(
    'SELECT * FROM pushSubscriptions WHERE profileId=? LIMIT 5',
  )
    .bind(profileId)
    .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
  await Promise.allSettled(
    rows.results.map(async (row) => {
      if (!validPushEndpoint(row.endpoint)) return;
      // Never include message contents or the sender’s identity on a lock screen.
      const details = webPush.generateRequestDetails(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify({
          title: 'Elsewhere',
          body:
            type === 'message'
              ? 'You have a new message.'
              : type.startsWith('friend')
                ? 'You have a connection update.'
                : 'You have an account update.',
          url:
            type === 'message' && targetId
              ? `/chat?conversation=${encodeURIComponent(targetId)}`
              : `/chat?view=${type.startsWith('friend') ? 'friends' : 'settings'}`,
        }),
        {
          TTL: 600,
          urgency: 'normal',
          vapidDetails: {
            subject: env.APP_ORIGIN,
            publicKey: env.VAPID_PUBLIC_KEY!,
            privateKey: env.VAPID_PRIVATE_KEY!,
          },
        },
      );
      const result = await fetch(row.endpoint, {
        method: 'POST',
        headers: details.headers as HeadersInit,
        body: details.body ? new Uint8Array(details.body) : null,
        signal: AbortSignal.timeout(3500),
        redirect: 'error',
      });
      if (result.status === 404 || result.status === 410)
        await env.DB.prepare('DELETE FROM pushSubscriptions WHERE id=?')
          .bind(row.id)
          .run();
    }),
  );
}
