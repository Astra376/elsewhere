import { searchCities } from './location';
import { z } from 'zod';
import { createAuth } from './auth';
import {
  ApiError,
  blocked,
  conversation,
  getProfile,
  hash,
  json,
  limit,
  notify,
  ownProfile,
  publicPeer,
  requireMember,
  validProxySecret,
  type RowProfile,
} from './data';
import {
  aiPersonas,
  defaultPreferences,
  normalizeInterests,
  plans,
  profileSchema,
  POLICY_VERSION,
  roomCatalog,
  type ChatMessage,
  type Game,
} from '../lib/domain';
import { billing } from './billing';
import { mediaRoute } from './media';
import { callRoute } from './calls';
import { pushRoute } from './push';
import { moderationRoute, supportRoute } from './moderation';
import type { Env } from './env';
export { ChatRoom, Matchmaker } from './realtime';
export { BillingCoordinator } from './billing-coordinator';

const identifier = z.string().min(1).max(100);
async function roomRequest(
  env: Env,
  chatId: string,
  profileId: string,
  path: string,
  data: unknown,
) {
  return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(chatId)).fetch(
    new Request(`https://room${path}`, {
      method: 'POST',
      headers: {
        'X-Profile-Id': profileId,
        'X-Chat-Id': chatId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const url = new URL(request.url),
        path = url.pathname;
      if (path === '/health')
        return json({ status: 'ok', service: 'elsewhere-api' });
      if (
        env.API_PROXY_KEY &&
        path !== '/api/socket' &&
        path !== '/api/billing/webhook' &&
        !(await validProxySecret(
          request.headers.get('X-Elsewhere-Proxy'),
          env.API_PROXY_KEY,
        ))
      )
        throw new ApiError(403, 'Use ChatUp to access this service.');
      const origin = request.headers.get('Origin');
      if (origin && origin !== env.APP_ORIGIN)
        throw new ApiError(403, 'This origin is not allowed.');
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': env.APP_ORIGIN,
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
            Vary: 'Origin',
          },
        });
      if (
        !['GET', 'HEAD'].includes(request.method) &&
        path !== '/api/billing/webhook' &&
        origin !== env.APP_ORIGIN
      )
        throw new ApiError(403, 'A same-origin request is required.');
      if (path === '/api/config')
        return json({
          ai: !!env.OPENROUTER_API_KEY,
          google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
          billing: !!(
            env.STRIPE_SECRET_KEY &&
            env.STRIPE_WEBHOOK_SECRET &&
            env.STRIPE_BASIC_MONTHLY &&
            env.STRIPE_BASIC_YEARLY &&
            env.STRIPE_PLUS_MONTHLY &&
            env.STRIPE_PLUS_YEARLY
          ),
          turn: !!(env.TURN_KEY_ID && env.TURN_API_TOKEN),
          groupCalls: !!(env.REALTIME_APP_ID && env.REALTIME_API_TOKEN),
          push: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
          vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
          apiOrigin: env.API_ORIGIN,
          plans,
        });
      if (path === '/api/billing/webhook')
        return await billing(request, env, null);
      const auth = createAuth(env);
      if (path.startsWith('/api/auth/')) {
        if (
          [
            '/api/auth/sign-up/email',
            '/api/auth/request-password-reset',
          ].includes(path) &&
          !env.RESEND_API_KEY
        )
          throw new ApiError(
            503,
            'Email sign-in will be available once email delivery is connected.',
            'not_configured',
          );
        return await auth.handler(request);
      }
      if (path === '/api/socket') {
        if (request.headers.get('Upgrade') !== 'websocket')
          throw new ApiError(426, 'WebSocket required.');
        const token = url.searchParams.get('ticket') ?? '';
        if (token.length > 100)
          throw new ApiError(401, 'Invalid connection ticket.');
        const ticket = await env.DB.prepare(
          'DELETE FROM socketTickets WHERE hash=? AND expiresAt>? RETURNING profileId,chatId,sessionId',
        )
          .bind(await hash(token), Date.now())
          .first<{ profileId: string; chatId: string; sessionId: string }>();
        if (!ticket)
          throw new ApiError(
            401,
            'This connection ticket expired. Please reconnect.',
          );
        const headers = new Headers(request.headers);
        headers.set('X-Profile-Id', ticket.profileId);
        headers.set('X-Chat-Id', ticket.chatId);
        headers.set('X-Session-Id', ticket.sessionId);
        return env.CHAT_ROOMS.get(
          env.CHAT_ROOMS.idFromName(ticket.chatId),
        ).fetch(new Request('https://room/socket', { headers }));
      }
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session)
        throw new ApiError(
          401,
          'Start a guest session or sign in.',
          'unauthenticated',
        );
      let profile = await env.DB.prepare(
        'SELECT * FROM profiles WHERE authId=?',
      )
        .bind(session.user.id)
        .first<RowProfile>();
      if (!profile) {
        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO profiles (id,authId,username,avatar,banner,gender,interests,prefs,plan,standing,createdAt,lastSeen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(authId) DO NOTHING',
        )
          .bind(
            crypto.randomUUID(),
            session.user.id,
            session.user.name.slice(0, 24),
            '🪐',
            'violet',
            'undisclosed',
            '[]',
            JSON.stringify(defaultPreferences),
            'free',
            'good',
            now,
            now,
          )
          .run();
        profile = (await env.DB.prepare('SELECT * FROM profiles WHERE authId=?')
          .bind(session.user.id)
          .first<RowProfile>())!;
      }
      const guest = !!session.user.isAnonymous;
      if (path === '/api/me' && request.method === 'GET') {
        if (Date.now() - profile.lastSeen > 30000)
          ctx.waitUntil(
            env.DB.prepare('UPDATE profiles SET lastSeen=? WHERE id=?')
              .bind(Date.now(), profile.id)
              .run(),
          );
        return json({
          ...ownProfile(profile, guest, session.user.email),
          moderator: (env.ADMIN_USER_IDS ?? '')
            .split(',')
            .includes(session.user.id),
        });
      }
      if (path === '/api/locations/cities' && request.method === 'GET')
        return await searchCities(request, env, profile);
      if (path === '/api/consent' && request.method === 'POST') {
        z.object({
          adult: z.literal(true),
          acceptTerms: z.literal(true),
        }).parse(await request.json());
        await env.DB.prepare(
          'UPDATE profiles SET acceptedAt=?,policyVersion=? WHERE id=?',
        )
          .bind(Date.now(), POLICY_VERSION, profile.id)
          .run();
        return json(
          ownProfile(
            await getProfile(env, profile.id),
            guest,
            session.user.email,
          ),
        );
      }
      if (path === '/api/push') return await pushRoute(request, env, profile);
      if (path === '/api/support')
        return await supportRoute(request, env, profile);
      if (path.startsWith('/api/admin/'))
        return await moderationRoute(request, env, session.user.id);
      if (
        !profile.acceptedAt &&
        request.method === 'POST' &&
        (path === '/api/match' ||
          path === '/api/rooms/join' ||
          path === '/api/dm')
      )
        throw new ApiError(
          403,
          'Confirm that you are 18 or older and accept the terms before chatting.',
          'consent_required',
        );
      if (
        profile.standing === 'suspended' &&
        !['GET', 'HEAD'].includes(request.method) &&
        ![
          '/api/account',
          '/api/appeal',
          '/api/billing/portal',
          '/api/notifications/read',
        ].includes(path)
      )
        throw new ApiError(
          403,
          'Your account is suspended. You can review your standing in Settings.',
        );
      if (path === '/api/profile' && request.method === 'PATCH') {
        await limit(env, `profile:${profile.id}`, 30);
        const data = profileSchema.parse(await request.json());
        const interests = normalizeInterests(data.interests ?? []);
        if (interests.length > plans[profile.plan].interests)
          throw new ApiError(
            403,
            `Your plan includes ${plans[profile.plan].interests} interest slots.`,
            'plan_required',
          );
        if (
          data.avatar &&
          ![
            '🪐',
            '🌻',
            '🍊',
            '🦊',
            '🐼',
            '🌊',
            '🌵',
            '🦋',
            '🎮',
            '🐙',
            '🌈',
            '☕',
          ].includes(data.avatar) &&
          !/^\/api\/media\/[\da-f-]{36}$/.test(data.avatar)
        )
          throw new ApiError(400, 'Choose an avatar or upload an image.');
        if (data.avatar?.startsWith('/api/media/')) {
          const owned = await env.DB.prepare(
            'SELECT 1 FROM media WHERE id=? AND ownerId=? AND purpose=?',
          )
            .bind(data.avatar.split('/').at(-1), profile.id, 'avatar')
            .first();
          if (!owned)
            throw new ApiError(403, 'That avatar does not belong to you.');
        }
        await env.DB.prepare(
          'UPDATE profiles SET username=COALESCE(?,username),avatar=COALESCE(?,avatar),banner=COALESCE(?,banner),gender=COALESCE(?,gender),interests=COALESCE(?,interests),prefs=json_patch(prefs,?) WHERE id=?',
        )
          .bind(
            data.username ?? null,
            data.avatar ?? null,
            data.banner ?? null,
            data.gender ?? null,
            data.interests ? JSON.stringify(interests) : null,
            JSON.stringify(data.preferences ?? {}),
            profile.id,
          )
          .run();
        return json(
          ownProfile(
            await getProfile(env, profile.id),
            guest,
            session.user.email,
          ),
        );
      }
      if (path.startsWith('/api/media') || path === '/api/upload')
        return await mediaRoute(request, env, profile);
      if (path.startsWith('/api/billing/'))
        return await billing(request, env, profile);
      if (path === '/api/account' && request.method === 'DELETE') {
        const body = z
          .object({ confirmation: z.literal('DELETE') })
          .parse(await request.json());
        void body;
        const subscription = await env.DB.prepare(
          'SELECT id FROM subscriptions WHERE profileId=? AND status IN (?,?,?)',
        )
          .bind(profile.id, 'active', 'trialing', 'past_due')
          .first();
        if (subscription)
          throw new ApiError(
            409,
            'Cancel your subscription in billing before deleting your account.',
          );
        if (profile.stripeCustomerId || env.STRIPE_SECRET_KEY) {
          const billingCheck = await env.BILLING.get(
            env.BILLING.idFromName(profile.id),
          ).fetch(
            new Request('https://billing/close', {
              method: 'POST',
              headers: { 'X-Profile-Id': profile.id },
            }),
          );
          if (!billingCheck.ok) return billingCheck;
        }
        const owned = await env.DB.prepare(
          'SELECT objectKey FROM media WHERE ownerId=?',
        )
          .bind(profile.id)
          .all<{ objectKey: string }>();
        for (let i = 0; i < owned.results.length; i += 500)
          await env.FILES.delete(
            owned.results.slice(i, i + 500).map((x) => x.objectKey),
          );
        await env.DB.batch([
          env.DB.prepare(
            'UPDATE messages SET senderId=?,text=?,mediaId=NULL WHERE senderId=?',
          ).bind('deleted', '[Message removed]', profile.id),
          env.DB.prepare(
            'DELETE FROM pushSubscriptions WHERE profileId=?',
          ).bind(profile.id),
          env.DB.prepare('DELETE FROM user WHERE id=?').bind(session.user.id),
        ]);
        return json({ deleted: true });
      }
      if (path === '/api/notifications' && request.method === 'GET')
        return json(
          (
            await env.DB.prepare(
              'SELECT * FROM notifications WHERE profileId=? ORDER BY createdAt DESC LIMIT 100',
            )
              .bind(profile.id)
              .all()
          ).results,
        );
      if (path === '/api/notifications/read' && request.method === 'POST') {
        await env.DB.prepare(
          'UPDATE notifications SET readAt=? WHERE profileId=? AND readAt IS NULL',
        )
          .bind(Date.now(), profile.id)
          .run();
        return json({ ok: true });
      }
      if (path === '/api/friends' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT f.id AS friendshipId,f.requester,f.recipient,f.status,f.createdAt AS requestedAt,p.* FROM friendships f JOIN profiles p ON p.id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END WHERE f.requester=? OR f.recipient=? ORDER BY f.createdAt DESC LIMIT 200',
        )
          .bind(profile.id, profile.id, profile.id)
          .all<
            RowProfile & {
              friendshipId: string;
              requester: string;
              recipient: string;
              status: string;
              requestedAt: number;
            }
          >();
        return json(
          rows.results.map((p) => ({
            id: p.friendshipId,
            peer: publicPeer(p),
            status: p.status,
            incoming: p.recipient === profile.id,
            createdAt: p.requestedAt,
          })),
        );
      }
      if (path === '/api/friends/request' && request.method === 'POST') {
        await limit(env, `friends:${profile.id}`, 15, 3600);
        const { peerId } = z
          .object({ peerId: identifier })
          .parse(await request.json());
        if (peerId === profile.id)
          throw new ApiError(400, 'Choose another person.');
        const peer = await getProfile(env, peerId);
        if (
          !(JSON.parse(peer.prefs).friendRequests ?? true) ||
          (await blocked(env, profile.id, peer.id))
        )
          throw new ApiError(403, 'This person is not accepting requests.');
        const encountered = await env.DB.prepare(
          'SELECT 1 FROM members a JOIN members b ON a.chatId=b.chatId WHERE a.profileId=? AND b.profileId=? LIMIT 1',
        )
          .bind(profile.id, peerId)
          .first();
        if (!encountered)
          throw new ApiError(
            403,
            'Meet someone in a conversation before adding them.',
          );
        const key = [profile.id, peerId].sort().join(':');
        const result = await env.DB.prepare(
          'INSERT INTO friendships (id,requester,recipient,pairKey,status,createdAt) VALUES (?,?,?,?,?,?) ON CONFLICT(pairKey) DO NOTHING RETURNING id',
        )
          .bind(
            crypto.randomUUID(),
            profile.id,
            peerId,
            key,
            'pending',
            Date.now(),
          )
          .first();
        if (result)
          await notify(
            env,
            peerId,
            'friend_request',
            `${profile.username} sent you a friend request.`,
            profile.id,
          );
        return json({ status: 'pending' });
      }
      if (
        path.match(/^\/api\/friends\/[^/]+$/) &&
        ['PATCH', 'DELETE'].includes(request.method)
      ) {
        const id = path.split('/').at(-1)!;
        const friend = await env.DB.prepare(
          'SELECT * FROM friendships WHERE id=? AND (requester=? OR recipient=?)',
        )
          .bind(id, profile.id, profile.id)
          .first<{
            id: string;
            requester: string;
            recipient: string;
            status: string;
          }>();
        if (!friend) throw new ApiError(404, 'Request not found.');
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM friendships WHERE id=?')
            .bind(id)
            .run();
          return json({ ok: true });
        }
        if (friend.recipient !== profile.id || friend.status !== 'pending')
          throw new ApiError(
            403,
            'Only the recipient can accept this request.',
          );
        if (await blocked(env, profile.id, friend.requester))
          throw new ApiError(403, 'This connection is blocked.');
        await env.DB.prepare('UPDATE friendships SET status=? WHERE id=?')
          .bind('accepted', id)
          .run();
        await notify(
          env,
          friend.requester,
          'friend_accepted',
          `${profile.username} accepted your friend request.`,
          profile.id,
        );
        return json({ status: 'accepted' });
      }
      if (path === '/api/dm' && request.method === 'POST') {
        const { peerId } = z
          .object({ peerId: identifier })
          .parse(await request.json());
        const pair = [profile.id, peerId].sort().join(':');
        const accepted = await env.DB.prepare(
          'SELECT 1 FROM friendships WHERE pairKey=? AND status=?',
        )
          .bind(pair, 'accepted')
          .first();
        if (!accepted || (await blocked(env, profile.id, peerId)))
          throw new ApiError(
            403,
            'Add each other as friends before messaging.',
          );
        const id = `dm:${pair}`;
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO chats (id,kind,mode,title,createdAt) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          ).bind(id, 'dm', 'text', 'Direct message', now),
          env.DB.prepare(
            'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?) ON CONFLICT(chatId,profileId) DO UPDATE SET leftAt=NULL',
          ).bind(id, profile.id, now),
          env.DB.prepare(
            'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?) ON CONFLICT(chatId,profileId) DO UPDATE SET leftAt=NULL',
          ).bind(id, peerId, now),
        ]);
        return json(await conversation(env, id, profile.id));
      }
      if (path === '/api/rooms' && request.method === 'GET') {
        const counts = await env.DB.prepare(
          'SELECT c.slug,COUNT(m.profileId) AS count FROM chats c LEFT JOIN members m ON m.chatId=c.id AND m.leftAt IS NULL LEFT JOIN profiles p ON p.id=m.profileId WHERE c.kind=? AND (p.lastSeen>? OR p.id IS NULL) GROUP BY c.slug',
        )
          .bind('room', Date.now() - 90000)
          .all<{ slug: string; count: number }>();
        return json(
          roomCatalog.map((room) => ({
            ...room,
            count: counts.results.find((c) => c.slug === room.slug)?.count ?? 0,
          })),
        );
      }
      if (path === '/api/rooms/join' && request.method === 'POST') {
        const { slug } = z
          .object({ slug: identifier })
          .parse(await request.json());
        const room = roomCatalog.find((r) => r.slug === slug);
        if (!room) throw new ApiError(404, 'Room not found.');
        if (profile.standing === 'suspended' || profile.standing === 'limited')
          throw new ApiError(
            403,
            'Room access is unavailable for your account.',
          );
        const id = `room:${room.slug}`,
          now = Date.now();
        await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO chats (id,kind,mode,title,slug,createdAt) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          ).bind(id, 'room', room.mode, room.title, room.slug, now),
          env.DB.prepare(
            'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?) ON CONFLICT(chatId,profileId) DO UPDATE SET leftAt=NULL,joinedAt=excluded.joinedAt',
          ).bind(id, profile.id, now),
        ]);
        return json(await conversation(env, id, profile.id));
      }
      if (path === '/api/history' && request.method === 'GET') {
        const chats = await env.DB.prepare(
          'SELECT c.id,m.joinedAt FROM chats c JOIN members m ON m.chatId=c.id WHERE m.profileId=? AND c.kind IN (?,?) ORDER BY m.joinedAt DESC LIMIT ?',
        )
          .bind(profile.id, 'match', 'ai', plans[profile.plan].history)
          .all<{ id: string; joinedAt: number }>();
        return json(
          await Promise.all(
            chats.results.map(async (c) => ({
              ...(await conversation(env, c.id, profile.id)),
              joinedAt: c.joinedAt,
            })),
          ),
        );
      }
      if (path === '/api/match' && request.method === 'POST') {
        await limit(env, `match:${profile.id}`, 30);
        const body = (await request.json()) as Record<string, unknown>;
        return env.MATCHMAKER.get(env.MATCHMAKER.idFromName('match:en')).fetch(
          new Request('https://matchmaker/', {
            method: 'POST',
            body: JSON.stringify({
              profileId: profile.id,
              action: 'join',
              options: body,
              location: {
                country: request.headers.get('X-ChatUp-Country') ?? undefined,
                latitude: request.headers.has('X-ChatUp-Latitude')
                  ? Number(request.headers.get('X-ChatUp-Latitude'))
                  : undefined,
                longitude: request.headers.has('X-ChatUp-Longitude')
                  ? Number(request.headers.get('X-ChatUp-Longitude'))
                  : undefined,
              },
            }),
          }),
        );
      }
      if (path === '/api/match' && ['GET', 'DELETE'].includes(request.method))
        return env.MATCHMAKER.get(env.MATCHMAKER.idFromName('match:en')).fetch(
          new Request('https://matchmaker/', {
            method: 'POST',
            body: JSON.stringify({
              profileId: profile.id,
              action: request.method === 'GET' ? 'status' : 'cancel',
            }),
          }),
        );
      if (path === '/api/socket-ticket' && request.method === 'POST') {
        const { chatId } = z
          .object({ chatId: identifier })
          .parse(await request.json());
        await requireMember(env, chatId, profile.id);
        await limit(env, `socket:${profile.id}`, 20);
        const token = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO socketTickets (hash,profileId,chatId,expiresAt,sessionId) VALUES (?,?,?,?,?)',
        )
          .bind(
            await hash(token),
            profile.id,
            chatId,
            Date.now() + 30000,
            session.session.id,
          )
          .run();
        return json({
          url: `${env.API_ORIGIN.replace(/^http/, 'ws')}/api/socket?ticket=${token}`,
        });
      }
      const chatPath = path.match(
        /^\/api\/chats\/([^/]+)(?:\/(messages|leave|games|call|ice))?$/,
      );
      if (chatPath) {
        const chatId = decodeURIComponent(chatPath[1]),
          action = chatPath[2];
        const chat = await requireMember(
          env,
          chatId,
          profile.id,
          !(
            !action ||
            action === 'leave' ||
            (['messages', 'games'].includes(action) && request.method === 'GET')
          ),
        );
        if (!action && request.method === 'GET') {
          const detail = await conversation(env, chatId, profile.id);
          if (chat.kind === 'ai') {
            const persona = aiPersonas.find((p) => p.id === chat.aiPersona)!;
            detail.kind = 'match';
            detail.title = 'A new connection';
            detail.aiPersona = undefined;
            detail.peers = [
              {
                id: `ai:${persona.id}`,
                username: persona.name,
                avatar: persona.avatar,
                interests: [...persona.interests],
                plan: 'free',
                online: true,
              },
            ];
          }
          return json(detail);
        }
        if (action === 'messages' && request.method === 'GET') {
          const after = Math.max(
            0,
            Number(url.searchParams.get('after') ?? 0) || 0,
          );
          const rows = await env.DB.prepare(
            'SELECT m.*,COALESCE(p.username,?) AS senderName FROM messages m LEFT JOIN profiles p ON p.id=m.senderId WHERE m.chatId=? AND m.sequence>? AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker=? AND b.blocked=m.senderId) OR (b.blocked=? AND b.blocker=m.senderId)) ORDER BY m.sequence ASC LIMIT 100',
          )
            .bind('Someone', chatId, after, profile.id, profile.id)
            .all<ChatMessage>();
          return json({
            messages: rows.results,
            hasMore: rows.results.length === 100,
          });
        }
        if (action === 'messages' && request.method === 'POST')
          return roomRequest(
            env,
            chatId,
            profile.id,
            '/message',
            await request.json(),
          );
        if (action === 'leave' && request.method === 'POST') {
          return roomRequest(env, chatId, profile.id, '/leave', {});
        }
        if (action === 'games' && request.method === 'GET') {
          const game = await env.DB.prepare(
            'SELECT state FROM games WHERE chatId=? ORDER BY createdAt DESC LIMIT 1',
          )
            .bind(chatId)
            .first<{ state: string }>();
          return json(game ? (JSON.parse(game.state) as Game) : null);
        }
        if (action === 'games' && request.method === 'POST')
          return roomRequest(
            env,
            chatId,
            profile.id,
            '/game',
            await request.json(),
          );
        if (action === 'call') {
          if (request.method !== 'POST') throw new ApiError(405, 'Use POST.');
          return roomRequest(env, chatId, profile.id, '/call', {});
        }
        if (action === 'ice')
          return await callRoute(request, env, profile, chatId, action);
      }
      if (path === '/api/report' && request.method === 'POST') {
        await limit(env, `report:${profile.id}`, 10, 3600);
        const data = z
          .object({
            peerId: identifier,
            chatId: identifier,
            reason: z.enum([
              'harassment',
              'sexual-content',
              'underage',
              'spam',
              'danger',
              'other',
            ]),
            details: z.string().trim().max(2000).default(''),
            block: z.boolean().default(true),
          })
          .parse(await request.json());
        await requireMember(env, data.chatId, profile.id, false);
        await requireMember(env, data.chatId, data.peerId, false);
        if (data.peerId === profile.id)
          throw new ApiError(400, 'You cannot report your own profile.');
        const context = await env.DB.prepare(
          'SELECT m.senderId,COALESCE(p.username,?) AS senderName,m.text,m.kind,m.mediaId,m.createdAt FROM messages m LEFT JOIN profiles p ON p.id=m.senderId WHERE m.chatId=? AND m.senderId IN (?,?) ORDER BY m.sequence DESC LIMIT 20',
        )
          .bind('Deleted account', data.chatId, profile.id, data.peerId)
          .all();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO reports (id,reporter,reported,chatId,reason,details,createdAt,context) VALUES (?,?,?,?,?,?,?,?)',
        )
          .bind(
            id,
            profile.id,
            data.peerId,
            data.chatId,
            data.reason,
            data.details,
            Date.now(),
            JSON.stringify(context.results.reverse()),
          )
          .run();
        if (data.block)
          await env.DB.batch([
            env.DB.prepare(
              'INSERT INTO blocks (blocker,blocked,createdAt) VALUES (?,?,?) ON CONFLICT DO NOTHING',
            ).bind(profile.id, data.peerId, Date.now()),
            env.DB.prepare('DELETE FROM friendships WHERE pairKey=?').bind(
              [profile.id, data.peerId].sort().join(':'),
            ),
          ]);
        return json({ id, status: 'received' });
      }
      if (path === '/api/blocks' && request.method === 'GET')
        return json(
          (
            await env.DB.prepare(
              'SELECT p.id,p.username,p.avatar FROM blocks b JOIN profiles p ON p.id=b.blocked WHERE b.blocker=?',
            )
              .bind(profile.id)
              .all()
          ).results,
        );
      if (path === '/api/blocks' && request.method === 'DELETE') {
        const { peerId } = z
          .object({ peerId: identifier })
          .parse(await request.json());
        await env.DB.prepare('DELETE FROM blocks WHERE blocker=? AND blocked=?')
          .bind(profile.id, peerId)
          .run();
        return json({ ok: true });
      }
      throw new ApiError(404, 'This page or action was not found.');
    } catch (error) {
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500;
      if (status === 500)
        console.error('api_error', {
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : 'unknown',
        });
      return json(
        {
          error:
            error instanceof ApiError
              ? error.message
              : error instanceof z.ZodError
                ? error.issues[0]?.message
                : 'Something went wrong. Your saved data is safe. Please try again.',
          code: error instanceof ApiError ? error.code : 'request_failed',
        },
        status,
      );
    }
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare(
          'DELETE FROM matchQueue WHERE heartbeatAt<? AND chatId IS NULL',
        ).bind(Date.now() - 60000),
        env.DB.prepare('DELETE FROM socketTickets WHERE expiresAt<?').bind(
          Date.now(),
        ),
        env.DB.prepare('DELETE FROM apiLimits WHERE expiresAt<?').bind(
          Math.floor(Date.now() / 1000),
        ),
        env.DB.prepare(
          'DELETE FROM notifications WHERE createdAt<? AND readAt IS NOT NULL',
        ).bind(Date.now() - 30 * 86400000),
        env.DB.prepare(
          'DELETE FROM messages WHERE createdAt<? AND chatId IN (SELECT id FROM chats WHERE kind IN (?,?))',
        ).bind(Date.now() - 30 * 86400000, 'match', 'ai'),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;
