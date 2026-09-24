import { locationCompatible, type MatchLocation } from '../lib/location';
import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import {
  clipChatLine,
  driftPersona,
  generatePersona,
  interestsRequired,
  matchSchema,
  parsePersona,
  personaPrompt,
  plans,
  readPause,
  sharedInterests,
  typingHold,
  isJunkLine,
  playMove,
  type MatchOptions,
  type RuntimePersona,
  type Game,
  type ChatMessage,
} from '../lib/domain';
import {
  ApiError,
  blocked,
  getProfile,
  json,
  limit,
  notify,
  requireMember,
} from './data';
import type { Env } from './env';
import { callRoute } from './calls';

type Attachment = {
  profileId: string;
  chatId: string;
  expiresAt: number;
  sessionId: string;
  checkedAt: number;
};
const messageSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().max(4000),
  kind: z.enum(['text', 'image', 'video']).default('text'),
  mediaId: z.uuid().optional(),
});
export class ChatRoom extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  private aiTail: Promise<unknown> = Promise.resolve();
  private callTail: Promise<unknown> = Promise.resolve();
  fetch(request: Request) {
    // Provider setup is serialized separately so slow media services cannot
    // hold up persisted text messages or leaving the conversation.
    if (new URL(request.url).pathname === '/call') {
      const result = this.callTail.then(() => this.handle(request));
      this.callTail = result.catch(() => {});
      return result;
    }
    const result = this.tail.then(() => this.handle(request));
    this.tail = result.catch(() => {});
    return result;
  }
  async handle(request: Request) {
    try {
      const url = new URL(request.url),
        profileId = request.headers.get('X-Profile-Id')!,
        chatId = request.headers.get('X-Chat-Id')!;
      const [chat, profile] = await Promise.all([
        requireMember(this.env, chatId, profileId, url.pathname !== '/leave'),
        url.pathname === '/leave'
          ? Promise.resolve(null)
          : getProfile(this.env, profileId),
      ]);
      if (url.pathname === '/leave') {
        const ended = chat.kind === 'match' || chat.kind === 'ai';
        const now = Date.now();
        const changes = [
          this.env.DB.prepare(
            'UPDATE members SET leftAt=COALESCE(leftAt,?) WHERE chatId=? AND profileId=?',
          ).bind(now, chatId, profileId),
          this.env.DB.prepare('DELETE FROM matchQueue WHERE profileId=?').bind(
            profileId,
          ),
        ];
        if (ended)
          changes.push(
            this.env.DB.prepare(
              'UPDATE chats SET endedAt=COALESCE(endedAt,?) WHERE id=?',
            ).bind(now, chatId),
            this.env.DB.prepare('DELETE FROM matchQueue WHERE chatId=?').bind(
              chatId,
            ),
          );
        await this.env.DB.batch(changes);
        if (ended) await this.ctx.storage.deleteAlarm();
        this.broadcast({ type: 'left', profileId, ended });
        for (const ws of ended
          ? this.ctx.getWebSockets()
          : this.ctx.getWebSockets(profileId))
          ws.close(1000, 'Conversation left');
        return json({ ok: true });
      }
      if (!profile) throw new ApiError(404, 'Profile not found.');
      if (profile.standing === 'suspended')
        throw new ApiError(403, 'Your account is suspended.');
      if (url.pathname === '/call')
        return await callRoute(
          request,
          this.env,
          profile,
          chatId,
          'call',
          this.ctx.storage,
        );
      if (url.pathname === '/socket') {
        if (request.headers.get('Upgrade') !== 'websocket')
          throw new ApiError(426, 'WebSocket upgrade required.');
        const sessionId = request.headers.get('X-Session-Id') ?? '';
        const session = await this.env.DB.prepare(
          'SELECT 1 FROM session WHERE id=? AND userId=? AND expiresAt>?',
        )
          .bind(sessionId, profile.authId, Date.now())
          .first();
        if (!session) throw new ApiError(401, 'Your session expired.');
        if (this.ctx.getWebSockets(profileId).length >= 3)
          throw new ApiError(
            429,
            'This conversation is already open in several tabs.',
          );
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server, [profileId]);
        server.serializeAttachment({
          profileId,
          chatId,
          expiresAt: Date.now() + 3600000,
          sessionId,
          checkedAt: Date.now(),
        } satisfies Attachment);
        server.send(JSON.stringify({ type: 'connected', chatId }));
        this.broadcast({ type: 'presence', profileId, online: true });
        if (chat.kind === 'ai') this.ctx.waitUntil(this.arm(chatId));
        return new Response(null, { status: 101, webSocket: client });
      }
      if (url.pathname === '/broadcast') {
        this.broadcast(await request.json());
        return json({ ok: true });
      }
      if (url.pathname === '/message') {
        if (chat.endedAt)
          throw new ApiError(409, 'This conversation has ended.');
        if (profile.standing === 'limited')
          throw new ApiError(403, 'Messaging is temporarily limited.');
        const data = messageSchema.parse(await request.json());
        const bucket = Math.floor(Date.now() / 60000);
        const checks = await this.env.DB.batch([
          this.env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(
            data.id,
          ),
          this.env.DB.prepare(
            'INSERT INTO apiLimits (key,count,expiresAt) SELECT ?,1,? WHERE NOT EXISTS (SELECT 1 FROM messages WHERE id=?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
          ).bind(`message:${profileId}:${bucket}`, (bucket + 2) * 60, data.id),
          this.env.DB.prepare(
            'SELECT profileId FROM members WHERE chatId=? AND profileId<>? AND leftAt IS NULL',
          ).bind(chatId, profileId),
          this.env.DB.prepare(
            'SELECT 1 FROM blocks b JOIN members m ON m.chatId=? AND m.leftAt IS NULL AND m.profileId<>? WHERE (b.blocker=? AND b.blocked=m.profileId) OR (b.blocked=? AND b.blocker=m.profileId) LIMIT 1',
          ).bind(chatId, profileId, profileId, profileId),
        ]);
        const existing = checks[0].results[0] as ChatMessage | undefined;
        if (existing) {
          if (existing.senderId !== profileId || existing.chatId !== chatId)
            throw new ApiError(409, 'Message identifier already used.');
          return json(existing);
        }
        if (
          Number(
            (checks[1].results[0] as { count?: number } | undefined)?.count ??
              41,
          ) > 40
        )
          throw new ApiError(
            429,
            'Slow down a little. Try again shortly.',
            'rate_limited',
          );
        const otherMembers = {
          results: checks[2].results as { profileId: string }[],
        };
        if (chat.kind !== 'room' && checks[3].results.length)
          throw new ApiError(
            403,
            'Messaging is unavailable between these accounts.',
          );
        if (data.kind === 'text' && !data.text)
          throw new ApiError(400, 'Write a message first.');
        if (data.kind !== 'text') {
          if (!plans[profile.plan][data.kind === 'image' ? 'images' : 'videos'])
            throw new ApiError(
              403,
              `This media type requires ${data.kind === 'image' ? 'Basic' : 'Plus'}.`,
              'plan_required',
            );
          const media = await this.env.DB.prepare(
            'SELECT id,mime FROM media WHERE id=? AND ownerId=? AND chatId=?',
          )
            .bind(data.mediaId ?? '', profileId, chatId)
            .first<{ id: string; mime: string }>();
          if (!media || !media.mime.startsWith(`${data.kind}/`))
            throw new ApiError(400, 'Attachment is missing or invalid.');
        }
        const message = await this.env.DB.prepare(
          'INSERT INTO messages (id,chatId,senderId,text,kind,mediaId,createdAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *',
        )
          .bind(
            data.id,
            chatId,
            profileId,
            data.text,
            data.kind,
            data.mediaId ?? null,
            Date.now(),
          )
          .first<ChatMessage>();
        if (!message)
          return json(
            await this.env.DB.prepare(
              'SELECT * FROM messages WHERE id=? AND chatId=? AND senderId=?',
            )
              .bind(data.id, chatId, profileId)
              .first(),
          );
        await this.broadcastMessage(
          {
            type: 'message',
            message: { ...message, senderName: profile.username },
          },
          profileId,
        );
        if (chat.kind === 'dm')
          for (const other of otherMembers.results) {
            if (!this.ctx.getWebSockets(other.profileId).length)
              this.ctx.waitUntil(
                notify(
                  this.env,
                  other.profileId,
                  'message',
                  `${profile.username} sent you a message.`,
                  chatId,
                ),
              );
          }
        if (chat.kind === 'ai') {
          const reply = this.aiTail.then(() => this.replyAsAI(chatId, message));
          this.aiTail = reply.catch(() => {});
          this.ctx.waitUntil(reply);
        }
        return json({ ...message, senderName: profile.username }, 201);
      }
      if (url.pathname === '/game') {
        if (chat.endedAt)
          throw new ApiError(409, 'This conversation has ended.');
        const body = (await request.json()) as {
          action: string;
          kind: 'tic-tac-toe' | 'connect-four';
          cell: number;
          revision: number;
          gameId: string;
          peerId: string;
        };
        await limit(this.env, `game:${profileId}`, 100);
        if (body.action === 'start') {
          if (!['tic-tac-toe', 'connect-four'].includes(body.kind))
            throw new ApiError(400, 'Choose a game.');
          const current = await this.env.DB.prepare(
            'SELECT state FROM games WHERE chatId=? ORDER BY createdAt DESC LIMIT 1',
          )
            .bind(chatId)
            .first<{ state: string }>();
          if (current && !JSON.parse(current.state).winner)
            return json(JSON.parse(current.state));
          const peer = await this.env.DB.prepare(
            'SELECT profileId FROM members WHERE chatId=? AND profileId<>? AND leftAt IS NULL LIMIT 1',
          )
            .bind(chatId, profileId)
            .first<{ profileId: string }>();
          const persona = parsePersona(chat.aiPersona);
          const peerId =
            chat.kind === 'ai' ? `ai:${persona.id}` : peer?.profileId;
          if (!peerId)
            throw new ApiError(
              409,
              'Wait for someone to join before starting a game.',
            );
          const game: Game = {
            id: crypto.randomUUID(),
            chatId,
            kind: body.kind,
            board: Array(body.kind === 'tic-tac-toe' ? 9 : 42).fill(null),
            players: [profileId, peerId],
            turn: profileId,
            winner: null,
            revision: 0,
          };
          await this.env.DB.prepare(
            'INSERT INTO games (id,chatId,state,revision,createdAt) VALUES (?,?,?,0,?)',
          )
            .bind(game.id, chatId, JSON.stringify(game), Date.now())
            .run();
          this.broadcast({ type: 'game', game });
          return json(game);
        }
        const row = await this.env.DB.prepare(
          'SELECT state FROM games WHERE id=? AND chatId=?',
        )
          .bind(body.gameId, chatId)
          .first<{ state: string }>();
        if (!row) throw new ApiError(404, 'Game not found.');
        let game = playMove(
          JSON.parse(row.state),
          profileId,
          body.cell,
          body.revision,
        );
        if (!game.winner && game.turn.startsWith('ai:')) {
          const legal =
            game.kind === 'tic-tac-toe'
              ? game.board.flatMap((x, i) => (x ? [] : [i]))
              : Array.from({ length: 7 }, (_, i) => i).filter(
                  (i) => !game.board[i],
                );
          const cell = legal[Math.floor(Math.random() * legal.length)];
          game = playMove(game, game.turn, cell, game.revision);
        }
        const update = await this.env.DB.prepare(
          'UPDATE games SET state=?,revision=? WHERE id=? AND revision=? RETURNING id',
        )
          .bind(JSON.stringify(game), game.revision, game.id, body.revision)
          .first();
        if (!update) throw new ApiError(409, 'The board changed. Try again.');
        this.broadcast({ type: 'game', game });
        return json(game);
      }
      throw new ApiError(404, 'Not found.');
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        error instanceof ApiError ? error.status : 400,
      );
    }
  }
  broadcast(event: unknown, exclude?: WebSocket) {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch {
        try {
          ws.close(1011, 'Reconnect to continue');
        } catch {}
      }
    }
  }
  async broadcastMessage(event: unknown, senderId: string) {
    const blocks = await this.env.DB.prepare(
      'SELECT CASE WHEN blocker=? THEN blocked ELSE blocker END AS id FROM blocks WHERE blocker=? OR blocked=?',
    )
      .bind(senderId, senderId, senderId)
      .all<{ id: string }>();
    const excluded = new Set(blocks.results.map((row) => row.id));
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment;
      if (!excluded.has(attachment.profileId)) {
        try {
          ws.send(JSON.stringify(event));
        } catch {
          try {
            ws.close(1011, 'Reconnect to continue');
          } catch {}
        }
      }
    }
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    try {
      if (typeof raw !== 'string' || raw.length > 20000)
        throw new Error('Invalid event');
      const state = ws.deserializeAttachment() as Attachment;
      if (Date.now() > state.expiresAt) {
        ws.close(4001, 'Refresh session');
        return;
      }
      if (Date.now() - state.checkedAt > 20000) {
        const session = await this.env.DB.prepare(
          'SELECT 1 FROM session s JOIN profiles p ON p.authId=s.userId WHERE s.id=? AND p.id=? AND s.expiresAt>? AND p.standing<>?',
        )
          .bind(state.sessionId, state.profileId, Date.now(), 'suspended')
          .first();
        if (!session) {
          ws.close(4001, 'Session expired');
          return;
        }
        state.checkedAt = Date.now();
        ws.serializeAttachment(state);
      }
      const data = JSON.parse(raw);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (data.type === 'message') {
        const response = await this.fetch(
          new Request('https://room/message', {
            method: 'POST',
            headers: {
              'X-Profile-Id': state.profileId,
              'X-Chat-Id': state.chatId,
            },
            body: JSON.stringify(data.message),
          }),
        );
        const result = await response.json();
        ws.send(
          JSON.stringify({
            type: 'message_ack',
            id: data.message?.id,
            ...(response.ok
              ? { message: result }
              : {
                  error:
                    (result as { error?: string }).error ??
                    'Message could not be sent.',
                }),
          }),
        );
        return;
      }
      await requireMember(this.env, state.chatId, state.profileId);
      const profile = await getProfile(this.env, state.profileId);
      if (profile.standing === 'suspended')
        throw new Error('Account suspended');
      if (data.type === 'typing') {
        await limit(this.env, `typing:${state.profileId}`, 60);
        this.broadcast(
          { type: 'typing', profileId: state.profileId, typing: !!data.typing },
          ws,
        );
      } else if (data.type === 'signal') {
        await limit(this.env, `signal:${state.profileId}`, 180);
        if (
          typeof data.to !== 'string' ||
          (await blocked(this.env, state.profileId, data.to))
        )
          throw new Error('Invalid recipient');
        await requireMember(this.env, state.chatId, data.to);
        for (const peer of this.ctx.getWebSockets(data.to))
          peer.send(
            JSON.stringify({
              type: 'signal',
              from: state.profileId,
              signal: data.signal,
            }),
          );
      }
    } catch {
      try {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Could not process this event. Reconnect if it continues.',
          }),
        );
      } catch {}
    }
  }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    const state = ws.deserializeAttachment() as Attachment;
    try {
      ws.close(code, reason);
    } catch {}
    if (!this.ctx.getWebSockets(state.profileId).filter((s) => s !== ws).length)
      this.broadcast({
        type: 'presence',
        profileId: state.profileId,
        online: false,
      });
  }
  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, 'Reconnect to continue');
    } catch {}
  }
  async replyAsAI(chatId: string, message: ChatMessage) {
    if (!this.env.OPENROUTER_API_KEY) return;
    await this.ctx.storage.put('aiBusy', 1);
    const senderIdBox = { id: '' };
    try {
      const active = await this.env.DB.prepare(
        'SELECT aiPersona FROM chats WHERE id=? AND endedAt IS NULL',
      )
        .bind(chatId)
        .first<{ aiPersona: string | null }>();
      if (!active) return;
      const claim = await this.env.DB.prepare(
        'INSERT INTO aiJobs (messageId,chatId,status,createdAt) VALUES (?,?,?,?) ON CONFLICT(messageId) DO NOTHING RETURNING messageId',
      )
        .bind(message.id, chatId, 'running', Date.now())
        .first();
      if (!claim) return;
      await limit(this.env, `ai:${message.senderId}`, 300, 3600);
      let persona = parsePersona(active.aiPersona);
      senderIdBox.id = `ai:${persona.id}`;
      const recent = await this.env.DB.prepare(
        'SELECT senderId, text FROM messages WHERE chatId=? AND kind=? ORDER BY sequence DESC LIMIT 8',
      )
        .bind(chatId, 'text')
        .all<{ senderId: string; text: string }>();
      const lastBot =
        recent.results.find((row) => row.senderId.startsWith('ai:'))?.text ??
        '';
      const greeted = recent.results.some(
        (row) => row.senderId.startsWith('ai:') && isGreeting(row.text),
      );
      const copying =
        !!lastBot && sameText(message.text, lastBot);
      const scripted = copying
        ? copyCall(persona)
        : isGreeting(message.text) && greeted
          ? moveOn(persona)
          : '';
      if (scripted) {
        await this.pause(readPause(persona.pace));
        const open = await this.env.DB.prepare(
          'SELECT id FROM chats WHERE id=? AND endedAt IS NULL',
        )
          .bind(chatId)
          .first();
        if (!open) return;
        await this.deliver(chatId, persona, scripted, `ai-${message.id}`);
        await this.env.DB.prepare('UPDATE aiJobs SET status=? WHERE messageId=?')
          .bind('complete', message.id)
          .run();
        await this.arm(chatId);
        return;
      }
      const pending = this.compose(chatId, persona, 'reply');
      await this.pause(readPause(persona.pace));
      const rawText = await pending;
      if (/^\s*skip\s*$/i.test(rawText)) {
        await this.env.DB.prepare('UPDATE aiJobs SET status=? WHERE messageId=?')
          .bind('complete', message.id)
          .run();
        await this.ctx.storage.put('chatId', chatId);
        await this.ctx.storage.put('nextAct', 'leave');
        await this.ctx.storage.setAlarm(Date.now() + 2000 + Math.random() * 5000);
        return;
      }
      const raw = clipLines(rawText, persona);
      if (!raw.length) raw.push(moveOn(persona));
      for (let index = 0; index < raw.length; index++) {
        if (sameText(raw[index], message.text)) raw[index] = copyCall(persona);
        else if (isGreeting(raw[index]) && greeted) raw[index] = moveOn(persona);
      }
      const open = await this.env.DB.prepare(
        'SELECT id FROM chats WHERE id=? AND endedAt IS NULL',
      )
        .bind(chatId)
        .first();
      if (!open) {
        await this.env.DB.prepare('UPDATE aiJobs SET status=? WHERE messageId=?')
          .bind('cancelled', message.id)
          .run();
        return;
      }
      for (let index = 0; index < raw.length; index++) {
        await this.deliver(
          chatId,
          persona,
          raw[index],
          index === 0 ? `ai-${message.id}` : `ai-${message.id}-b`,
        );
      }
      if (raw.length) {
        persona = driftPersona(persona, message.text);
        await this.env.DB.prepare('UPDATE chats SET aiPersona=? WHERE id=?')
          .bind(JSON.stringify(persona), chatId)
          .run();
      }
      await this.env.DB.prepare('UPDATE aiJobs SET status=? WHERE messageId=?')
        .bind('complete', message.id)
        .run();
      await this.arm(chatId);
    } catch (error) {
      await this.env.DB.prepare(
        'UPDATE aiJobs SET status=?,error=? WHERE messageId=?',
      )
        .bind('failed', 'Reply failed', message.id)
        .run();
      const limited = error instanceof ApiError && error.status === 429;
      if (!limited && senderIdBox.id) {
        try {
          const row = await this.env.DB.prepare(
            'SELECT aiPersona FROM chats WHERE id=? AND endedAt IS NULL',
          )
            .bind(chatId)
            .first<{ aiPersona: string | null }>();
          if (row)
            await this.deliver(
              chatId,
              parsePersona(row.aiPersona),
              moveOn(parsePersona(row.aiPersona)),
              `ai-fallback-${message.id}`,
            );
        } catch {}
      }
    } finally {
      await this.ctx.storage.delete('aiBusy');
      if (senderIdBox.id)
        this.broadcast({
          type: 'typing',
          profileId: senderIdBox.id,
          typing: false,
        });
    }
  }
  async alarm() {
    if (!this.env.OPENROUTER_API_KEY) return;
    const chatId = await this.ctx.storage.get<string>('chatId');
    if (!chatId) return;
    if (await this.ctx.storage.get('aiBusy')) {
      await this.ctx.storage.setAlarm(Date.now() + 3000);
      return;
    }
    await this.ctx.storage.put('aiBusy', 1);
    let senderId = '';
    try {
      const chat = await this.env.DB.prepare(
        'SELECT aiPersona, endedAt, kind FROM chats WHERE id=?',
      )
        .bind(chatId)
        .first<{
          aiPersona: string | null;
          endedAt: number | null;
          kind: string;
        }>();
      if (!chat || chat.kind !== 'ai' || chat.endedAt) return;
      const last = await this.env.DB.prepare(
        'SELECT senderId, createdAt FROM messages WHERE chatId=? ORDER BY sequence DESC LIMIT 1',
      )
        .bind(chatId)
        .first<{ senderId: string; createdAt: number }>();
      if (last && !last.senderId.startsWith('ai:')) return;
      const trailing = await this.trailingAi(chatId);
      const stored = await this.ctx.storage.get<string>('nextAct');
      const act =
        trailing === 0 ? 'open' : stored === 'nudge' ? 'nudge' : 'leave';
      const persona = parsePersona(chat.aiPersona);
      senderId = `ai:${persona.id}`;
      if (act === 'leave') {
        await this.endStranger(chatId, senderId);
        return;
      }
      const line = cannedLine(persona, act === 'nudge' ? 'nudge' : 'open');
      await this.deliver(chatId, persona, line, `ai-${act}-${crypto.randomUUID()}`);
      await this.arm(chatId);
    } finally {
      await this.ctx.storage.delete('aiBusy');
      if (senderId)
        this.broadcast({ type: 'typing', profileId: senderId, typing: false });
    }
  }
  async arm(chatId: string) {
    await this.ctx.storage.put('chatId', chatId);
    const chat = await this.env.DB.prepare(
      'SELECT kind, endedAt, aiPersona FROM chats WHERE id=?',
    )
      .bind(chatId)
      .first<{ kind: string; endedAt: number | null; aiPersona: string | null }>();
    if (!chat || chat.kind !== 'ai' || chat.endedAt) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const persona = parsePersona(chat.aiPersona);
    const rows = await this.env.DB.prepare(
      'SELECT senderId FROM messages WHERE chatId=? ORDER BY sequence DESC LIMIT 6',
    )
      .bind(chatId)
      .all<{ senderId: string }>();
    const plan = nextSilence(
      persona,
      rows.results.map((row) => row.senderId),
    );
    if (!plan) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.put('nextAct', plan.action);
    await this.ctx.storage.setAlarm(Date.now() + plan.wait);
  }
  async trailingAi(chatId: string) {
    const rows = await this.env.DB.prepare(
      'SELECT senderId FROM messages WHERE chatId=? ORDER BY sequence DESC LIMIT 6',
    )
      .bind(chatId)
      .all<{ senderId: string }>();
    let count = 0;
    for (const row of rows.results) {
      if (!row.senderId.startsWith('ai:')) break;
      count++;
    }
    return count;
  }
  async endStranger(chatId: string, senderId: string) {
    const now = Date.now();
    await this.env.DB.batch([
      this.env.DB.prepare(
        'UPDATE chats SET endedAt=COALESCE(endedAt,?) WHERE id=?',
      ).bind(now, chatId),
      this.env.DB.prepare('DELETE FROM matchQueue WHERE chatId=?').bind(chatId),
    ]);
    await this.ctx.storage.deleteAlarm();
    this.broadcast({ type: 'left', profileId: senderId, ended: true });
  }
  async compose(
    chatId: string,
    persona: RuntimePersona,
    kind: 'reply' | 'open' | 'nudge',
  ) {
    const history = await this.env.DB.prepare(
      'SELECT senderId,text FROM messages WHERE chatId=? AND kind=? ORDER BY sequence DESC LIMIT 24',
    )
      .bind(chatId, 'text')
      .all<{ senderId: string; text: string }>();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.env.APP_ORIGIN,
        'X-Title': 'ChatUp',
      },
      body: JSON.stringify({
        model: this.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash',
        messages: [
          { role: 'system', content: personaPrompt(persona, kind) },
          ...history.results.reverse().flatMap((row) => {
            if (row.senderId.startsWith('ai:') && isJunkLine(row.text)) return [];
            return [
              {
                role: row.senderId.startsWith('ai:') ? 'assistant' : 'user',
                content: row.text,
              },
            ];
          }),
          ...(history.results.length
            ? []
            : [{ role: 'user', content: 'matched' }]),
        ],
        max_tokens: 48,
        temperature: 0.9,
        reasoning: { enabled: false, effort: 'none' },
        provider: { data_collection: 'deny' },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (body.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
      .trim();
  }
  async deliver(
    chatId: string,
    persona: RuntimePersona,
    text: string,
    id: string,
  ) {
    const senderId = `ai:${persona.id}`;
    this.broadcast({ type: 'typing', profileId: senderId, typing: true });
    await this.pause(typingHold(persona.pace, text.length));
    const saved = await this.env.DB.prepare(
      'INSERT INTO messages (id,chatId,senderId,text,kind,createdAt) VALUES (?,?,?,?,?,?) RETURNING *',
    )
      .bind(id, chatId, senderId, text, 'text', Date.now())
      .first<ChatMessage>();
    this.broadcast({
      type: 'message',
      message: { ...saved, senderName: persona.name },
    });
    this.broadcast({ type: 'typing', profileId: senderId, typing: false });
  }
  pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function sameText(a: string, b: string) {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  const left = norm(a);
  const right = norm(b);
  return left.length > 0 && left === right;
}
function isGreeting(text: string) {
  return /^(h+i+|he+y+|hello+|yo+|sup+|hiya|heya|whatsup|wassup)$/.test(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ''),
  );
}
function copyCall(persona: RuntimePersona) {
  const list =
    persona.casing === 'lower'
      ? ['lol why you copying me', 'bro stop', 'u just said that', 'lmao why']
      : ['Lol why are you copying me', 'You just said that', 'Bro stop'];
  return list[Math.floor(Math.random() * list.length)];
}
function moveOn(persona: RuntimePersona) {
  const list =
    persona.casing === 'lower'
      ? ['nm u', 'wyd', 'u good', 'what u on', 'hows it going']
      : ['Not much, you?', 'Wyd', 'You good', 'Hows it going'];
  return list[Math.floor(Math.random() * list.length)];
}
function cannedLine(persona: RuntimePersona, action: 'open' | 'nudge') {
  if (action === 'nudge') {
    const list =
      persona.casing === 'lower'
        ? ['??', 'u there', 'hello', 'yo']
        : ['??', 'You there', 'Hello?'];
    return list[Math.floor(Math.random() * list.length)];
  }
  const list = persona.samples.length ? [persona.samples[0]] : ['hey'];
  return list[0];
}
function nextSilence(persona: RuntimePersona, senders: string[]) {
  let trailing = 0;
  for (const id of senders) {
    if (!id.startsWith('ai:')) break;
    trailing++;
  }
  const last = senders[0];
  if (last && !last.startsWith('ai:')) return null;
  if (trailing === 0) {
    const wait =
      persona.pace === 'fast'
        ? 600 + Math.random() * 1200
        : persona.pace === 'slow'
          ? 1800 + Math.random() * 2200
          : 900 + Math.random() * 1600;
    return { wait, action: 'open' as const };
  }
  if (trailing >= 2)
    return { wait: 6000 + Math.random() * 10000, action: 'leave' as const };
  if (persona.skips === 'fast')
    return { wait: 10000 + Math.random() * 12000, action: 'leave' as const };
  if (persona.skips === 'stays')
    return { wait: 20000 + Math.random() * 25000, action: 'leave' as const };
  if (Math.random() < 0.45)
    return { wait: 8000 + Math.random() * 10000, action: 'nudge' as const };
  return { wait: 12000 + Math.random() * 14000, action: 'leave' as const };
}
function arriveDelay() {
  const roll = Math.random();
  if (roll < 0.3) return 500 + Math.random() * 900;
  if (roll < 0.75) return 1500 + Math.random() * 2500;
  return 4000 + Math.random() * 4000;
}

function clipLines(raw: string, persona: RuntimePersona) {
  const max = persona.initiative === 'forward' ? 2 : 1;
  return raw
    .split('\n')
    .map((line) => clipChatLine(line, persona))
    .filter(Boolean)
    .slice(0, max);
}

type QueueRow = {
  profileId: string;
  mode: string;
  options: string;
  joinedAt: number;
  heartbeatAt: number;
  chatId: string | null;
};
export class Matchmaker extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  fetch(request: Request) {
    const work = this.tail.then(() => this.handle(request));
    this.tail = work.catch(() => {});
    return work;
  }
  async handle(request: Request) {
    try {
      const body = (await request.json()) as {
        profileId: string;
        action: 'join' | 'status' | 'cancel';
        options?: MatchOptions;
        location?: MatchLocation;
      };
      const profile = await getProfile(this.env, body.profileId);
      const now = Date.now();
      if (body.action === 'cancel') {
        const matched = await this.env.DB.prepare(
          'SELECT chatId FROM matchQueue WHERE profileId=?',
        )
          .bind(profile.id)
          .first<{ chatId: string | null }>();
        if (matched?.chatId) {
          const response = await this.env.CHAT_ROOMS.get(
            this.env.CHAT_ROOMS.idFromName(matched.chatId),
          ).fetch(
            new Request('https://room/leave', {
              method: 'POST',
              headers: {
                'X-Profile-Id': profile.id,
                'X-Chat-Id': matched.chatId,
              },
              body: '{}',
            }),
          );
          if (!response.ok) return response;
        }
        await this.env.DB.prepare('DELETE FROM matchQueue WHERE profileId=?')
          .bind(profile.id)
          .run();
        return json({ status: 'idle' });
      }
      let own = await this.env.DB.prepare(
        'SELECT * FROM matchQueue WHERE profileId=?',
      )
        .bind(profile.id)
        .first<QueueRow>();
      if (profile.standing === 'suspended' || profile.standing === 'limited') {
        await this.env.DB.prepare(
          'DELETE FROM matchQueue WHERE profileId=? AND chatId IS NULL',
        )
          .bind(profile.id)
          .run();
        throw new ApiError(
          403,
          'Matching is unavailable for your account standing.',
        );
      }
      if (own?.chatId) {
        const live = await this.env.DB.prepare(
          'SELECT endedAt FROM chats WHERE id=?',
        )
          .bind(own.chatId)
          .first<{ endedAt: number | null }>();
        if (!live || live.endedAt) {
          await this.env.DB.prepare('DELETE FROM matchQueue WHERE profileId=?')
            .bind(profile.id)
            .run();
          own = null;
        }
      }
      if (body.action === 'join') {
        if (!profile.acceptedAt)
          throw new ApiError(403, 'Accept the terms before matching.');
        if (own?.chatId) return json({ status: 'matched', chatId: own.chatId });
        const parsed = matchSchema.parse(body.options);
        const options = {
          ...parsed,
          matchLocation: {
            ...body.location,
            ...(parsed.nearMe ? parsed.location : {}),
          },
        };
        if (
          new Set(options.includeCountries).size !==
            options.includeCountries.length ||
          new Set(options.excludeCountries).size !==
            options.excludeCountries.length ||
          options.includeCountries.length > plans[profile.plan].countries ||
          options.excludeCountries.length > plans[profile.plan].countries
        )
          throw new ApiError(
            403,
            'Your plan has fewer country slots.',
            'plan_required',
          );
        if (
          options.includeCountries.some((c) =>
            options.excludeCountries.includes(c),
          )
        )
          throw new ApiError(
            400,
            'A country cannot be both included and excluded.',
          );
        if (options.nearMe && profile.plan === 'free')
          throw new ApiError(
            403,
            'Near me requires Basic or Plus.',
            'plan_required',
          );
        if (options.nearMe && !options.location)
          throw new ApiError(
            400,
            'Choose your city or allow location access first.',
          );
        if (
          (options.nearMe ||
            options.includeCountries.length ||
            options.excludeCountries.length) &&
          options.partnerType !== 'human'
        )
          throw new ApiError(400, 'Location preferences require People only.');
        // Keep only coarse coordinates in the temporary matchmaking queue.
        for (const key of ['latitude', 'longitude'] as const) {
          const value = options.matchLocation[key];
          if (typeof value === 'number' && Number.isFinite(value))
            options.matchLocation[key] = Math.round(value * 10) / 10;
          else delete options.matchLocation[key];
        }
        delete options.location;
        if (options.interests.length > plans[profile.plan].interests)
          throw new ApiError(403, 'Your plan has fewer interest slots.');
        if (options.genderFilter !== 'any' && profile.plan === 'free')
          throw new ApiError(
            403,
            'Gender matching requires Basic or Plus.',
            'plan_required',
          );
        if (options.mode !== 'text' && options.partnerType === 'ai')
          throw new ApiError(400, 'Text is required for that match.');
        const queued = { ...options, botAfter: now + arriveDelay() };
        await this.env.DB.prepare(
          'INSERT INTO matchQueue (profileId,mode,options,joinedAt,heartbeatAt,chatId) VALUES (?,?,?,?,?,NULL) ON CONFLICT(profileId) DO UPDATE SET mode=excluded.mode,options=excluded.options,joinedAt=excluded.joinedAt,heartbeatAt=excluded.heartbeatAt,chatId=NULL',
        )
          .bind(profile.id, options.mode, JSON.stringify(queued), now, now)
          .run();
        own = {
          profileId: profile.id,
          mode: options.mode,
          options: JSON.stringify(queued),
          joinedAt: now,
          heartbeatAt: now,
          chatId: null,
        };
      }
      if (!own) return json({ status: 'idle' });
      if (own.chatId) return json({ status: 'matched', chatId: own.chatId });
      await this.env.DB.prepare(
        'UPDATE matchQueue SET heartbeatAt=? WHERE profileId=?',
      )
        .bind(now, profile.id)
        .run();
      const rawOptions = JSON.parse(own.options) as { botAfter?: number };
      const options = matchSchema.parse(rawOptions);
      const botAfter = Number(rawOptions.botAfter);
      // Filter eligibility before limiting the result. A fixed prefix of the
      // queue can indefinitely hide compatible people with uncommon interests.
      let candidate: QueueRow | null = null;
      for (let offset = 0; options.partnerType !== 'ai'; offset += 100) {
        const batch = await this.env.DB.prepare(`
        SELECT q.* FROM matchQueue q JOIN profiles p ON p.id=q.profileId
        WHERE q.mode=? AND q.profileId<>? AND q.chatId IS NULL AND q.heartbeatAt>?
          AND p.standing NOT IN ('suspended','limited')
          AND json_extract(q.options,'$.partnerType')<>'ai'
          AND (?='any' OR p.gender=?)
          AND COALESCE(json_extract(q.options,'$.genderFilter'),'any') IN ('any',?)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
            (b.blocker=? AND b.blocked=p.id) OR (b.blocker=p.id AND b.blocked=?))
          AND ((?=0 AND (COALESCE(json_extract(q.options,'$.interestMatch'),0)=0 OR
            (json_extract(q.options,'$.waitSeconds')>0 AND ?-q.joinedAt>=json_extract(q.options,'$.waitSeconds')*1000)))
            OR EXISTS (SELECT 1 FROM json_each(q.options,'$.interests') theirs
              JOIN json_each(?) mine ON mine.value=theirs.value))
        ORDER BY CASE p.plan WHEN 'plus' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END DESC,q.joinedAt ASC
        LIMIT 100 OFFSET ?
      `)
          .bind(
            own.mode,
            profile.id,
            now - 20000,
            options.genderFilter,
            options.genderFilter,
            profile.gender,
            profile.id,
            profile.id,
            Number(interestsRequired(options, own.joinedAt, now)),
            now,
            JSON.stringify(options.interests),
            offset,
          )
          .all<QueueRow>();
        const ownLocation = JSON.parse(own.options).matchLocation ?? {};
        candidate =
          batch.results.find((row) => {
            const other = JSON.parse(row.options);
            return locationCompatible(
              options,
              ownLocation,
              other,
              other.matchLocation ?? {},
            );
          }) ?? null;
        if (candidate || batch.results.length < 100) break;
      }
      if (options.partnerType === 'ai' && !this.env.OPENROUTER_API_KEY)
        throw new ApiError(503, 'That is not available right now.');
      let persona: RuntimePersona | null = null;
      if (!candidate) {
        persona = await this.familiarPersona(profile.id, now);
        if (
          !persona ||
          (interestsRequired(options, own.joinedAt, now) &&
            !sharedInterests(persona.interests, options.interests).length)
        )
          persona = generatePersona(options.interests);
        const waitMs = Number.isFinite(botAfter) ? botAfter : own.joinedAt;
        const aiAllowed =
          options.mode === 'text' &&
          !!this.env.OPENROUTER_API_KEY &&
          (options.partnerType === 'ai' || now >= waitMs) &&
          (!interestsRequired(options, own.joinedAt, now) ||
            sharedInterests(persona.interests, options.interests).length > 0);
        if (!aiAllowed)
          return json({
            status: 'waiting',
            joinedAt: own.joinedAt,
            interestOnly: interestsRequired(options, own.joinedAt, now),
          });
      }
      const chatId = crypto.randomUUID();
      const statements = [
        this.env.DB.prepare(
          'INSERT INTO chats (id,kind,mode,title,aiPersona,createdAt) VALUES (?,?,?,?,?,?)',
        ).bind(
          chatId,
          candidate ? 'match' : 'ai',
          options.mode,
          'A new connection',
          candidate ? null : JSON.stringify(persona),
          now,
        ),
        this.env.DB.prepare(
          'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?)',
        ).bind(chatId, profile.id, now),
        this.env.DB.prepare(
          "UPDATE matchQueue SET chatId=?,options=json_remove(options,'$.matchLocation','$.location') WHERE profileId=?",
        ).bind(chatId, profile.id),
      ];
      if (candidate)
        statements.push(
          this.env.DB.prepare(
            'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?)',
          ).bind(chatId, candidate.profileId, now),
          this.env.DB.prepare(
            "UPDATE matchQueue SET chatId=?,options=json_remove(options,'$.matchLocation','$.location') WHERE profileId=?",
          ).bind(chatId, candidate.profileId),
        );
      await this.env.DB.batch(statements);
      return json({ status: 'matched', chatId });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Matching failed' },
        error instanceof ApiError ? error.status : 400,
      );
    }
  }
  async familiarPersona(profileId: string, now: number) {
    if (Math.random() > 0.08) return null;
    const rows = await this.env.DB.prepare(
      `SELECT c.aiPersona AS aiPersona FROM chats c
       JOIN members m ON m.chatId=c.id
       WHERE m.profileId=? AND c.kind='ai' AND c.createdAt>? AND c.aiPersona IS NOT NULL
       ORDER BY c.createdAt DESC LIMIT 8`,
    )
      .bind(profileId, now - 12 * 60 * 60 * 1000)
      .all<{ aiPersona: string }>();
    const people = rows.results.map((row) => parsePersona(row.aiPersona));
    if (people.length < 2) return null;
    return people[1 + Math.floor(Math.random() * (people.length - 1))];
  }
}
