import {
  ApiError,
  blocked,
  json,
  limit,
  requireMember,
  type RowProfile,
} from './data';
import { plans } from '../lib/domain';
import type { Env } from './env';

export function detectMedia(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (
    ascii(4, 8) === 'ftyp' &&
    ['isom', 'mp41', 'mp42', 'avc1', 'iso2', 'M4V '].includes(ascii(8, 12))
  )
    return 'video/mp4';
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'video/webm';
  return null;
}
async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Choose a file.');
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(
        413,
        `Files must be smaller than ${Math.round(max / 1048576)} MB.`,
      );
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function mediaRoute(
  request: Request,
  env: Env,
  profile: RowProfile,
) {
  const url = new URL(request.url);
  if (url.pathname === '/api/upload' && request.method === 'POST') {
    await limit(env, `upload:${profile.id}`, 30, 3600);
    if (profile.standing === 'suspended' || profile.standing === 'limited')
      throw new ApiError(403, 'Uploads are unavailable for your account.');
    const purpose = url.searchParams.get('purpose') ?? 'message';
    if (!['avatar', 'message'].includes(purpose))
      throw new ApiError(400, 'Invalid upload purpose.');
    const chatId = url.searchParams.get('chatId');
    if (purpose === 'message') {
      if (!chatId) throw new ApiError(400, 'Choose a conversation.');
      const chat = await requireMember(env, chatId, profile.id);
      if (chat.endedAt || chat.kind === 'ai')
        throw new ApiError(
          403,
          'Media is available in active conversations with people.',
        );
      if (!plans[profile.plan].images)
        throw new ApiError(
          403,
          'Image sharing requires Basic or Plus.',
          'plan_required',
        );
    }
    const max =
      purpose === 'avatar'
        ? 2 * 1048576
        : profile.plan === 'plus'
          ? 20 * 1048576
          : 5 * 1048576;
    const bytes = await boundedBody(request, max);
    const mime = detectMedia(bytes);
    if (!mime)
      throw new ApiError(415, 'Use a JPG, PNG, GIF, WebP, MP4, or WebM file.');
    if (
      mime.startsWith('video/') &&
      (purpose === 'avatar' || !plans[profile.plan].videos)
    )
      throw new ApiError(403, 'Video sharing requires Plus.', 'plan_required');
    const id = crypto.randomUUID(),
      key = `${profile.id}/${id}`;
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      await env.DB.prepare(
        'INSERT INTO media (id,ownerId,chatId,objectKey,mime,size,purpose,createdAt) VALUES (?,?,?,?,?,?,?,?)',
      )
        .bind(
          id,
          profile.id,
          chatId,
          key,
          mime,
          bytes.length,
          purpose,
          Date.now(),
        )
        .run();
    } catch (error) {
      await env.FILES.delete(key);
      throw error;
    }
    return json(
      {
        id,
        url: `/api/media/${id}`,
        kind: mime.startsWith('image/') ? 'image' : 'video',
      },
      201,
    );
  }
  if (url.pathname.startsWith('/api/media/') && request.method === 'GET') {
    const id = url.pathname.split('/').at(-1);
    const media = await env.DB.prepare('SELECT * FROM media WHERE id=?')
      .bind(id)
      .first<{
        ownerId: string;
        chatId: string | null;
        objectKey: string;
        purpose: string;
        mime: string;
      }>();
    if (!media)
      throw new ApiError(404, 'This attachment is no longer available.');
    if (await blocked(env, profile.id, media.ownerId))
      throw new ApiError(403, 'This attachment is unavailable.');
    if (media.purpose !== 'avatar' && media.ownerId !== profile.id) {
      if (!media.chatId) throw new ApiError(403, 'Private attachment.');
      await requireMember(env, media.chatId, profile.id, false);
    }
    const object = await env.FILES.get(media.objectKey, {
      range: request.headers,
    });
    if (!object) throw new ApiError(404, 'Attachment not found.');
    const range = object.range as
      | { offset?: number; length?: number; suffix?: number }
      | undefined;
    const offset =
      range?.offset ??
      (range?.suffix ? Math.max(0, object.size - range.suffix) : 0);
    const length =
      range?.length ??
      (range?.suffix ? Math.min(range.suffix, object.size) : object.size);
    return new Response(object.body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': media.mime,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(length),
        ...(range
          ? {
              'Content-Range': `bytes ${offset}-${offset + length - 1}/${object.size}`,
            }
          : {}),
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  }
  throw new ApiError(404, 'Media action not found.');
}
