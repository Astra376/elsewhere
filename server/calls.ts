import { ApiError, json, limit, requireMember, type RowProfile } from './data';
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
) {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.');
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
    if (!response.ok)
      throw new ApiError(
        502,
        'Could not connect the call relay. Please try again.',
      );
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
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/realtime/kit/${env.REALTIME_APP_ID}`;
  async function call(path: string, body: unknown) {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REALTIME_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await response.json()) as {
      success: boolean;
      data?: { id?: string; token?: string };
      result?: { data?: { id?: string; token?: string } };
    };
    if (!response.ok || !data.success)
      throw new ApiError(502, 'Could not start the room call. Please retry.');
    return data.data ?? data.result?.data;
  }
  let meetingId = chat.meetingId;
  if (!meetingId) {
    const created = await call('/meetings', {
      title: chat.title,
      record_on_start: false,
      live_stream_on_start: false,
      persist_chat: false,
    });
    if (!created?.id)
      throw new ApiError(502, 'The call provider did not return a meeting.');
    const row = await env.DB.prepare(
      'UPDATE chats SET meetingId=? WHERE id=? AND meetingId IS NULL RETURNING meetingId',
    )
      .bind(created.id, chatId)
      .first<{ meetingId: string }>();
    meetingId =
      row?.meetingId ??
      (await env.DB.prepare('SELECT meetingId FROM chats WHERE id=?')
        .bind(chatId)
        .first<{ meetingId: string }>())!.meetingId;
  }
  const participant = await call(`/meetings/${meetingId}/participants`, {
    name: profile.username,
    preset_name: 'group_call_participant',
    custom_participant_id: profile.id,
  });
  if (!participant?.token)
    throw new ApiError(502, 'Could not authorize the call.');
  return json({ authToken: participant.token, mode: chat.mode });
}
