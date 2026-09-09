import { timingSafeEqual } from 'node:crypto';
import {
  defaultPreferences,
  plans,
  type Profile,
  type Peer,
  type Conversation,
} from '../lib/domain';
import type { Env } from './env';
import { deliverPush } from './push';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'request_failed',
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export type RowProfile = {
  id: string;
  authId: string;
  username: string;
  avatar: string;
  banner: string;
  gender: string;
  interests: string;
  prefs: string;
  plan: Profile['plan'];
  standing: Profile['standing'];
  lastSeen: number;
  stripeCustomerId: string | null;
  acceptedAt: number | null;
};
export function publicPeer(row: RowProfile): Peer {
  const preferences = { ...defaultPreferences, ...JSON.parse(row.prefs) };
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    interests: preferences.interestsVisible ? JSON.parse(row.interests) : [],
    plan: preferences.badgeVisible ? row.plan : 'free',
    badgeVisible: preferences.badgeVisible,
    online: row.lastSeen > Date.now() - 60000,
  };
}
export function ownProfile(
  row: RowProfile,
  guest: boolean,
  email?: string,
): Profile {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    banner: row.banner,
    gender: row.gender,
    interests: JSON.parse(row.interests),
    preferences: { ...defaultPreferences, ...JSON.parse(row.prefs) },
    plan: row.plan in plans ? row.plan : 'free',
    standing: row.standing,
    guest,
    email: guest ? undefined : email,
    acceptedAt: row.acceptedAt,
  };
}
export async function limit(env: Env, key: string, max: number, seconds = 60) {
  const time = Math.floor(Date.now() / 1000),
    bucket = Math.floor(time / seconds),
    id = `${key}:${bucket}`;
  const row = await env.DB.prepare(
    'INSERT INTO apiLimits (key,count,expiresAt) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(id, (bucket + 2) * seconds)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new ApiError(
      429,
      'Slow down a little. Try again shortly.',
      'rate_limited',
    );
}
export async function getProfile(env: Env, id: string) {
  const p = await env.DB.prepare('SELECT * FROM profiles WHERE id=?')
    .bind(id)
    .first<RowProfile>();
  if (!p) throw new ApiError(404, 'Profile not found.');
  return p;
}
export async function blocked(env: Env, a: string, b: string) {
  return !!(await env.DB.prepare(
    'SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)',
  )
    .bind(a, b, b, a)
    .first());
}
export async function requireMember(
  env: Env,
  chatId: string,
  profileId: string,
  active = true,
) {
  const chat = await env.DB.prepare(
    `SELECT c.* FROM chats c JOIN members m ON m.chatId=c.id WHERE c.id=? AND m.profileId=? ${active ? 'AND m.leftAt IS NULL' : ''}`,
  )
    .bind(chatId, profileId)
    .first<
      Conversation & { aiPersona: string | null; meetingId: string | null }
    >();
  if (!chat)
    throw new ApiError(403, 'You do not have access to this conversation.');
  if (active && chat.endedAt)
    throw new ApiError(409, 'This conversation has ended.');
  if (active && chat.kind === 'dm') {
    const peer = await env.DB.prepare(
      'SELECT profileId FROM members WHERE chatId=? AND profileId<>? LIMIT 1',
    )
      .bind(chatId, profileId)
      .first<{ profileId: string }>();
    const friend =
      peer &&
      (await env.DB.prepare(
        'SELECT 1 FROM friendships WHERE pairKey=? AND status=?',
      )
        .bind([profileId, peer.profileId].sort().join(':'), 'accepted')
        .first());
    if (!friend)
      throw new ApiError(
        403,
        'Add each other as friends before continuing this conversation.',
      );
  }
  return chat;
}
export async function conversation(
  env: Env,
  chatId: string,
  profileId: string,
): Promise<Conversation> {
  const chat = await requireMember(env, chatId, profileId, false);
  const peers = await env.DB.prepare(
    `SELECT p.* FROM profiles p JOIN members m ON m.profileId=p.id WHERE m.chatId=? AND p.id<>? ${chat.kind === 'room' ? 'AND m.leftAt IS NULL AND p.lastSeen > ?' : ''} AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker=? AND b.blocked=p.id) OR (b.blocker=p.id AND b.blocked=?)) ORDER BY p.lastSeen DESC LIMIT 100`,
  )
    .bind(
      chatId,
      profileId,
      ...(chat.kind === 'room' ? [Date.now() - 60000] : []),
      profileId,
      profileId,
    )
    .all<RowProfile>();
  return { ...chat, peers: peers.results.map(publicPeer) };
}
export async function notify(
  env: Env,
  profileId: string,
  type: string,
  text: string,
  targetId?: string,
) {
  await env.DB.prepare(
    'INSERT INTO notifications (id,profileId,type,text,targetId,createdAt) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      crypto.randomUUID(),
      profileId,
      type,
      text,
      targetId ?? null,
      Date.now(),
    )
    .run();
  await deliverPush(env, profileId, type, targetId);
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function validProxySecret(
  supplied: string | null,
  expected: string,
) {
  if (!supplied || supplied.length > 256) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return timingSafeEqual(
    new Uint8Array(actualHash),
    new Uint8Array(expectedHash),
  );
}
