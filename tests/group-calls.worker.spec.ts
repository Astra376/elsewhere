/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers';
import { applyD1Migrations, evictDurableObject } from 'cloudflare:test';
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env } from '../server/env';

const runtime = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
beforeAll(() => applyD1Migrations(runtime.DB, runtime.TEST_MIGRATIONS));
afterEach(() => vi.restoreAllMocks());
async function room() {
  const chatId = crypto.randomUUID(),
    ids = [crypto.randomUUID(), crypto.randomUUID()];
  await runtime.DB.prepare(
    'INSERT INTO chats (id,kind,mode,title,createdAt) VALUES (?,?,?,?,?)',
  )
    .bind(chatId, 'room', 'video', 'Test room', Date.now())
    .run();
  for (const id of ids)
    await runtime.DB.batch([
      runtime.DB.prepare(
        'INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
      ).bind(id, 'CallTester', `${id}@example.invalid`, Date.now(), Date.now()),
      runtime.DB.prepare(
        'INSERT INTO profiles (id,authId,username,createdAt,lastSeen,acceptedAt) VALUES (?,?,?,?,?,?)',
      ).bind(id, id, 'CallTester', Date.now(), Date.now(), Date.now()),
      runtime.DB.prepare(
        'INSERT INTO members (chatId,profileId,joinedAt) VALUES (?,?,?)',
      ).bind(chatId, id, Date.now()),
    ]);
  const stub = runtime.CHAT_ROOMS.get(runtime.CHAT_ROOMS.idFromName(chatId));
  return {
    chatId,
    ids,
    stub,
    join: async (id: string) => {
      const response = await stub.fetch(
        new Request('https://room/call', {
          method: 'POST',
          headers: { 'X-Profile-Id': id, 'X-Chat-Id': chatId },
          body: '{}',
        }),
      );
      return {
        status: response.status,
        data: (await response.json()) as { authToken?: string },
      };
    },
  };
}
function provider(onMeeting?: () => Promise<void>) {
  const state = {
    meetings: 0,
    participants: 0,
    refreshes: 0,
    invalidToken: false,
    failedRefresh: false,
    presets: [] as string[],
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    expect(new URL(request.url).origin).toBe('https://api.cloudflare.com');
    if (path.endsWith('/meetings')) {
      state.meetings++;
      await onMeeting?.();
      expect(await request.json()).toMatchObject({
        record_on_start: false,
        live_stream_on_start: false,
        persist_chat: false,
      });
      return Response.json({ success: true, data: { id: 'meeting-fixture' } });
    }
    if (path.endsWith('/participants')) {
      state.participants++;
      const body = (await request.json()) as { preset_name: string };
      state.presets.push(body.preset_name);
      return Response.json({
        success: true,
        data: {
          id: `participant-${state.participants}`,
          ...(state.invalidToken
            ? {}
            : { token: `token-${state.participants}` }),
        },
      });
    }
    if (path.endsWith('/token')) {
      state.refreshes++;
      if (state.failedRefresh)
        return Response.json({ success: false }, { status: 503 });
      return Response.json({
        success: true,
        data: { token: `refresh-${state.refreshes}` },
      });
    }
    throw new Error('Unexpected provider operation');
  });
  return state;
}
it('simultaneous joins create one meeting and returning participants get a fresh token after restart', async () => {
  const state = provider(),
    fixture = await room();
  const joined = await Promise.all(fixture.ids.map((id) => fixture.join(id)));
  expect(joined.map((result) => result.status)).toEqual([200, 200]);
  expect(state.meetings).toBe(1);
  expect(state.participants).toBe(2);
  expect(state.presets).toEqual([
    'group_call_participant',
    'group_call_participant',
  ]);
  await evictDurableObject(fixture.stub);
  const again = await fixture.join(fixture.ids[0]);
  expect(again).toMatchObject({
    status: 200,
    data: { authToken: 'refresh-1' },
  });
  expect(state.meetings).toBe(1);
  expect(state.participants).toBe(2);
});
it('a slow call provider does not block text or leaving, and a late token is withheld', async () => {
  let released = false,
    entered = false;
  provider(async () => {
    entered = true;
    while (!released) await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const fixture = await room();
  const join = fixture.join(fixture.ids[0]);
  await expect.poll(() => entered).toBe(true);
  const headers = {
    'X-Profile-Id': fixture.ids[0],
    'X-Chat-Id': fixture.chatId,
  };
  try {
    const message = fixture.stub.fetch(
      new Request('https://room/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: crypto.randomUUID(),
          text: 'Text still works.',
          kind: 'text',
        }),
      }),
    );
    const response = await Promise.race([
      message,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Text was held behind call setup')),
          2000,
        ),
      ),
    ]);
    expect(response.status).toBe(201);
    await response.json();
    const left = await fixture.stub.fetch(
      new Request('https://room/leave', {
        method: 'POST',
        headers,
        body: '{}',
      }),
    );
    expect(left.status).toBe(200);
    await left.json();
  } finally {
    released = true;
    await join;
  }
  expect((await join).status).toBe(403);
});
it('provider failures preserve participant identity for a safe retry', async () => {
  const state = provider(),
    fixture = await room();
  state.invalidToken = true;
  expect((await fixture.join(fixture.ids[0])).status).toBe(502);
  state.failedRefresh = true;
  expect((await fixture.join(fixture.ids[0])).status).toBe(502);
  state.failedRefresh = false;
  expect((await fixture.join(fixture.ids[0])).status).toBe(200);
  expect(state.participants).toBe(1);
});
it('departed and restricted members cannot receive room call tokens', async () => {
  const state = provider(),
    fixture = await room();
  await runtime.DB.prepare(
    'UPDATE members SET leftAt=? WHERE chatId=? AND profileId=?',
  )
    .bind(Date.now(), fixture.chatId, fixture.ids[0])
    .run();
  expect((await fixture.join(fixture.ids[0])).status).toBe(403);
  await runtime.DB.prepare('UPDATE profiles SET standing=? WHERE id=?')
    .bind('limited', fixture.ids[1])
    .run();
  expect((await fixture.join(fixture.ids[1])).status).toBe(403);
  expect(state.meetings).toBe(0);
  expect(state.participants).toBe(0);
});
