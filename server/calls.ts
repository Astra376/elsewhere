import {
  ApiError,
  getProfile,
  json,
  limit,
  requireMember,
  type RowProfile,
} from './data';
import type { Env } from './env';
import { z } from 'zod';

const iceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export function parseIceServers(value: unknown) {
  const response = z
    .object({ iceServers: z.union([iceServer, z.array(iceServer).min(1)]) })
    .parse(value);
  return Array.isArray(response.iceServers)
    ? response.iceServers
    : [response.iceServers];
}
export async function callRoute(
  request: Request,
  env: Env,
  profile: RowProfile,
  chatId: string,
  action: string,
  storage?: DurableObjectStorage,
) {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.');
  if (['limited', 'suspended'].includes(profile.standing))
    throw new ApiError(403, 'Calls are unavailable for your account standing.');
  await limit(env, `call:${profile.id}`, 12);
  const chat = await requireMember(env, chatId, profile.id);
  if (chat.kind === 'ai' || chat.endedAt)
    throw new ApiError(
      403,
      'Calls are available in active human conversations.',
    );
  if (action === 'ice') {
    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN)
      throw new ApiError(
        503,
        'Voice and video relay is being connected. Text chat is available.',
        'not_configured',
      );
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(
        502,
        'Could not connect the call relay. Please try again.',
      );
    }
    const iceServers = parseIceServers(await response.json());
    return json({ iceServers, iceTransportPolicy: 'relay' });
  }
  if (
    !env.REALTIME_API_TOKEN ||
    !env.REALTIME_APP_ID ||
    !env.CLOUDFLARE_ACCOUNT_ID
  )
    throw new ApiError(
      503,
      'Group voice and video are being connected. You can still use room text chat.',
      'not_configured',
    );
  if (chat.kind !== 'room' || !storage)
    throw new ApiError(403, 'Group calls are available in chat rooms.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/realtime/kit/${env.REALTIME_APP_ID}`;
  async function call(path: string, body?: unknown) {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REALTIME_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(502, 'Could not start the room call. Please retry.');
    }
    const payload = await response.json();
    const data = z
      .object({
        success: z.literal(true),
        data: z.object({
          id: z.string().optional(),
          token: z.string().optional(),
        }),
      })
      .safeParse(payload);
    if (!data.success)
      throw new ApiError(
        502,
        'The call provider returned an invalid response. Please retry.',
      );
    return data.data.data;
  }
  // This runs inside the conversation's serialized Durable Object handler.
  // Persist a created meeting before D1, so a D1 failure does not create a new
  // meeting on retry. Participants keep their identity across fresh tokens.
  let meetingId = chat.meetingId ?? (await storage.get<string>('groupMeeting'));
  if (!meetingId) {
    const created = await call('/meetings', {
      title: chat.title,
      record_on_start: false,
      live_stream_on_start: false,
      persist_chat: false,
    });
    if (!created?.id)
      throw new ApiError(502, 'The call provider did not return a meeting.');
    meetingId = created.id;
    await storage.put('groupMeeting', meetingId);
  }
  if (!chat.meetingId)
    await env.DB.prepare('UPDATE chats SET meetingId=? WHERE id=?')
      .bind(meetingId, chatId)
      .run();
  const participantKey = `groupParticipant:${profile.id}`;
  const saved = await storage.get<{ meetingId: string; id: string }>(
    participantKey,
  );
  let token: string | undefined;
  if (saved?.meetingId === meetingId) {
    token = (
      await call(`/meetings/${meetingId}/participants/${saved.id}/token`)
    ).token;
  } else {
    const participant = await call(`/meetings/${meetingId}/participants`, {
      name: profile.username,
      preset_name: 'group_call_participant',
      custom_participant_id: profile.id,
    });
    if (!participant.id)
      throw new ApiError(
        502,
        'The call provider did not identify the participant.',
      );
    await storage.put(participantKey, { meetingId, id: participant.id });
    token = participant.token;
  }
  if (!token) throw new ApiError(502, 'Could not authorize the call.');
  // A leave or moderation decision can occur while the provider is responding.
  await requireMember(env, chatId, profile.id);
  if (
    ['limited', 'suspended'].includes(
      (await getProfile(env, profile.id)).standing,
    )
  )
    throw new ApiError(403, 'Calls are unavailable for your account standing.');
  return json({ authToken: token, mode: chat.mode });
}
