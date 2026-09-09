import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import WebSocket from 'ws';
import { parse as parseJsonc } from 'jsonc-parser';

// A fresh local database and Worker process for every run. Never targets a remote URL.
const root = resolve(import.meta.dirname, '..');
const work = join(root, '.wrangler', `integration-${randomUUID()}`);
const persistence = join(work, 'state');
const configPath = join(work, 'wrangler.json');
const origin = 'http://127.0.0.1:8790';
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
await mkdir(work, { recursive: true });
const configErrors = [];
const config = parseJsonc(
  await readFile(join(root, 'wrangler.api.jsonc'), 'utf8'),
  configErrors,
  { allowTrailingComma: true },
);
if (configErrors.length)
  throw new Error('The API Wrangler configuration is not valid JSONC.');
config.main = join(root, 'server/worker.ts');
config.vars = {
  ...config.vars,
  APP_ORIGIN: origin,
  API_ORIGIN: origin,
  AUTH_SECRET: randomUUID() + randomUUID(),
  ADMIN_USER_IDS: '',
};
config.d1_databases[0].migrations_dir = join(root, 'drizzle');
delete config.triggers;
await writeFile(configPath, JSON.stringify(config));
function command(args) {
  const result = spawnSync(
    process.execPath,
    [wrangler, ...args, '--config', configPath],
    {
      cwd: work,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CI: '1' },
    },
  );
  if (result.status) throw new Error(result.stderr + result.stdout);
  return result.stdout;
}
command([
  'd1',
  'migrations',
  'apply',
  'elsewhere-db',
  '--local',
  '--persist-to',
  persistence,
]);
const server = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--config',
    configPath,
    '--port',
    '8790',
    '--persist-to',
    persistence,
  ],
  {
    cwd: work,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' },
  },
);
let logs = '';
server.stdout.on('data', (d) => {
  logs += d;
});
server.stderr.on('data', (d) => {
  logs += d;
});
const sockets = [];
let assertions = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions++;
  console.log(`PASS ${label}`);
}
async function request(
  actor,
  path,
  body,
  method = body === undefined ? 'GET' : 'POST',
) {
  const headers = {
    Origin: origin,
    ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(origin + '/api' + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (actor) {
    const cookies = response.headers.getSetCookie();
    if (cookies.length)
      actor.cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  }
  return { status: response.status, data };
}
async function guest() {
  const actor = { ip: randomUUID(), cookie: '' };
  const login = await request(actor, '/auth/sign-in/anonymous', {});
  assert.equal(login.status, 200, JSON.stringify(login.data));
  actor.profile = (await request(actor, '/me')).data;
  return actor;
}
async function consent(actor) {
  return request(actor, '/consent', { adult: true, acceptTerms: true });
}
async function message(actor, chatId, text, id = randomUUID()) {
  return request(actor, `/chats/${encodeURIComponent(chatId)}/messages`, {
    id,
    text,
    kind: 'text',
  });
}
async function socket(actor, chatId) {
  const ticket = await request(actor, '/socket-ticket', { chatId });
  assert.equal(ticket.status, 200);
  const ws = new WebSocket(ticket.data.url, { headers: { Origin: origin } });
  sockets.push(ws);
  ws.events = [];
  ws.on('message', (raw) => ws.events.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, url: ticket.data.url };
}
async function waitFor(fn, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('Timed out waiting for event');
}
function sql(text) {
  return command([
    'd1',
    'execute',
    'elsewhere-db',
    '--local',
    '--persist-to',
    persistence,
    '--command',
    text,
  ]);
}
try {
  await waitFor(asyncReady, 30000);
  async function asyncReady() {
    try {
      return await fetch(origin + '/health').then((r) => r.ok);
    } catch {
      return false;
    }
  }
  check(
    (await request(null, '/me')).status,
    401,
    'private routes require a session',
  );
  const a = await guest(),
    b = await guest(),
    c = await guest();
  check(a.profile.guest, true, 'guest session starts without an account');
  check(
    (await request(a, '/match', {})).status,
    403,
    'server enforces adult terms acceptance',
  );
  await Promise.all([consent(a), consent(b), consent(c)]);
  check(
    (await request(a, '/me')).data.acceptedAt > 0,
    true,
    'terms acceptance is persisted',
  );
  const badOrigin = await fetch(origin + '/api/profile', {
    method: 'PATCH',
    headers: {
      Origin: 'https://evil.example',
      Cookie: a.cookie,
      'Content-Type': 'application/json',
    },
    body: '{"username":"hijacked"}',
  });
  check(badOrigin.status, 403, 'cross-origin profile changes are rejected');
  await Promise.all([
    request(a, '/profile', { preferences: { sound: false } }, 'PATCH'),
    request(a, '/profile', { preferences: { blurImages: false } }, 'PATCH'),
  ]);
  const preferences = (await request(a, '/me')).data.preferences;
  check(
    [preferences.sound, preferences.blurImages],
    [false, false],
    'concurrent preference changes preserve both values',
  );
  check(
    (await request(a, '/profile', { plan: 'plus', standing: 'good' }, 'PATCH'))
      .data.plan,
    'free',
    'client cannot grant itself a subscription',
  );
  check(
    (
      await request(
        a,
        '/profile',
        { interests: Array.from({ length: 6 }, (_, i) => `interest${i}`) },
        'PATCH',
      )
    ).status,
    403,
    'free interest slot limit enforced',
  );
  check(
    (await request(a, '/match', { genderFilter: 'woman' })).status,
    403,
    'paid filters enforced on the server',
  );
  check(
    (await request(a, '/match', { mode: 'voice', partnerType: 'ai' })).status,
    400,
    'AI is text-only',
  );
  check(
    (await request(a, '/match', { partnerType: 'ai' })).status,
    503,
    'missing AI credentials return a clear unavailable state',
  );
  check(
    (await request(a, '/match', {})).data.status,
    'waiting',
    'first person waits for a real match',
  );
  const matched = await request(b, '/match', {});
  const chatId = matched.data.chatId;
  check(matched.data.status, 'matched', 'two guests match successfully');
  check(
    (await request(a, '/match')).data.chatId,
    chatId,
    'both users receive the same chat',
  );
  check(
    (await request(c, `/chats/${chatId}`)).status,
    403,
    'third party cannot read private conversation',
  );
  check(
    (await request(c, '/socket-ticket', { chatId })).status,
    403,
    'third party cannot open its socket',
  );
  const aw = await socket(a, chatId),
    bw = await socket(b, chatId);
  const reused = await new Promise((resolve) => {
    const ws = new WebSocket(aw.url, { headers: { Origin: origin } });
    ws.on('unexpected-response', (_, response) => {
      resolve(response.statusCode);
      response.destroy();
    });
    ws.on('error', () => {});
  });
  check(reused, 401, 'socket tickets are single-use');
  const id = randomUUID();
  const [first, retry] = await Promise.all([
    message(a, chatId, 'hello :)', id),
    message(a, chatId, 'hello :)', id),
  ]);
  check(
    [first.data.id, retry.data.id],
    [id, id],
    'concurrent retries return the same message ID',
  );
  const delivered = await waitFor(() =>
    bw.ws.events.find((e) => e.type === 'message' && e.message.id === id),
  );
  check(
    delivered.message.text,
    'hello :)',
    'message reaches the other connected guest',
  );
  const history = await request(b, `/chats/${chatId}/messages`);
  check(
    history.data.messages.filter((m) => m.id === id).length,
    1,
    'duplicate sends are stored only once',
  );
  check(
    (await message(b, chatId, 'stolen id', id)).status,
    409,
    'other sender cannot reuse a message ID',
  );
  check((await message(a, chatId, '')).status, 400, 'empty messages rejected');
  check(
    (await message(a, chatId, 'x'.repeat(4001))).status,
    400,
    'oversized messages rejected',
  );
  aw.ws.send(
    JSON.stringify({
      type: 'signal',
      to: b.profile.id,
      signal: { ready: true },
    }),
  );
  check(
    !!(await waitFor(() =>
      bw.ws.events.find((e) => e.type === 'signal' && e.from === a.profile.id),
    )),
    true,
    'call signaling reaches only the authorized peer',
  );
  const [g1, g2] = await Promise.all([
    request(a, `/chats/${chatId}/games`, {
      action: 'start',
      kind: 'tic-tac-toe',
    }),
    request(b, `/chats/${chatId}/games`, {
      action: 'start',
      kind: 'tic-tac-toe',
    }),
  ]);
  check(g1.data.id, g2.data.id, 'simultaneous game starts produce one board');
  const turn = g1.data.turn === a.profile.id ? a : b,
    other = turn === a ? b : a;
  check(
    (
      await request(other, `/chats/${chatId}/games`, {
        action: 'move',
        gameId: g1.data.id,
        revision: 0,
        cell: 0,
      })
    ).status,
    400,
    'game rejects an out-of-turn move',
  );
  check(
    (
      await request(turn, `/chats/${chatId}/games`, {
        action: 'move',
        gameId: g1.data.id,
        revision: 0,
        cell: 0,
      })
    ).data.revision,
    1,
    'valid move advances the server board',
  );
  check(
    (
      await request(other, `/chats/${chatId}/games`, {
        action: 'move',
        gameId: g1.data.id,
        revision: 0,
        cell: 1,
      })
    ).status,
    400,
    'stale game revision is rejected',
  );
  check(
    (await request(a, '/friends/request', { peerId: c.profile.id })).status,
    403,
    'cannot request friendship with an unencountered profile',
  );
  await request(a, '/friends/request', { peerId: b.profile.id });
  const friend = (await request(b, '/friends')).data[0];
  check(friend.incoming, true, 'friend request appears for recipient');
  check(
    (await request(a, `/friends/${friend.id}`, {}, 'PATCH')).status,
    403,
    'sender cannot accept their own friend request',
  );
  check(
    (await request(b, `/friends/${friend.id}`, {}, 'PATCH')).data.status,
    'accepted',
    'recipient accepts friendship',
  );
  check(
    (await request(a, '/notifications')).data.some(
      (n) => n.type === 'friend_accepted',
    ),
    true,
    'friend acceptance creates a notification',
  );
  const dm = (await request(a, '/dm', { peerId: b.profile.id })).data;
  check(dm.kind, 'dm', 'accepted friends can open a direct message');
  check(
    (await message(a, dm.id, 'staying in touch')).status,
    201,
    'direct message is persisted',
  );
  bw.ws.close();
  await new Promise((r) => setTimeout(r, 50));
  const second = await message(a, chatId, 'sent during your disconnect');
  await socket(b, chatId);
  const catchup = await request(
    b,
    `/chats/${chatId}/messages?after=${first.data.sequence}`,
  );
  check(
    catchup.data.messages.some((m) => m.id === second.data.id),
    true,
    'reconnect recovers messages missed while disconnected',
  );
  check(
    (await request(a, `/friends/${friend.id}`, undefined, 'DELETE')).status,
    200,
    'unfriend succeeds',
  );
  check(
    (await message(b, dm.id, 'after unfriend')).status,
    403,
    'unfriending immediately revokes DM sending',
  );
  check(
    (
      await request(c, '/report', {
        peerId: a.profile.id,
        chatId,
        reason: 'spam',
      })
    ).status,
    403,
    'outsider cannot report private-chat participants',
  );
  check(
    (
      await request(b, '/report', {
        peerId: a.profile.id,
        chatId,
        reason: 'spam',
        block: true,
      })
    ).status,
    200,
    'participant can report and block',
  );
  check(
    (await message(a, chatId, 'blocked')).status,
    403,
    'block prevents one-to-one messages',
  );
  check(
    (await request(a, '/admin/reports')).status,
    403,
    'moderator endpoints reject regular users',
  );
  check(
    (await request(b, `/chats/${chatId}/leave`, {})).status,
    200,
    'leaving a match succeeds',
  );
  check(
    (await request(b, `/chats/${chatId}/leave`, {})).status,
    200,
    'leaving can safely be retried',
  );
  check(
    (await message(a, chatId, 'too late')).status,
    409,
    'ended conversations reject new messages',
  );
  await request(a, '/match', {});
  await request(c, '/match', {});
  check(
    (await request(a, '/match', undefined, 'DELETE')).data.status,
    'idle',
    'cancel handles a simultaneous completed match',
  );
  check(
    (await request(c, '/match')).data.status,
    'idle',
    'cancelled match clears the other matching queue',
  );
  const roomA = await request(a, '/rooms/join', { slug: 'after-hours' }),
    roomB = await request(b, '/rooms/join', { slug: 'after-hours' }),
    roomC = await request(c, '/rooms/join', { slug: 'after-hours' });
  check(roomA.data.id, roomB.data.id, 'room participants join the same room');
  check(roomC.status, 200, 'third participant joins a room');
  check(
    (await message(a, roomA.data.id, 'public room message')).status,
    201,
    'a room block does not prevent messaging everyone else',
  );
  check(
    (await request(b, `/chats/${encodeURIComponent(roomA.data.id)}/messages`))
      .data.messages.length,
    0,
    'room history hides blocked sender content',
  );
  check(
    (await request(c, `/chats/${encodeURIComponent(roomA.data.id)}/messages`))
      .data.messages.length,
    1,
    'unblocked room members see the message',
  );
  const upload = await fetch(
    origin + `/api/upload?chatId=${encodeURIComponent(roomA.data.id)}`,
    {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        'Content-Type': 'image/png',
      },
      body: Uint8Array.of(137, 80, 78, 71),
    },
  );
  check(upload.status, 403, 'media upload cannot bypass free-plan limits');
  sql(`UPDATE profiles SET plan='plus' WHERE id='${a.profile.id}'`);
  check(
    (await request(a, '/me')).data.plan,
    'plus',
    'server reads entitlement changes',
  );
  const badMedia = await fetch(origin + '/api/upload?purpose=avatar', {
    method: 'POST',
    headers: { Origin: origin, Cookie: a.cookie, 'Content-Type': 'image/png' },
    body: '<svg onload="alert(1)"></svg>',
  });
  check(
    badMedia.status,
    415,
    'active-content file disguised as an image is rejected',
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    'base64',
  );
  const image = await fetch(
    origin + `/api/upload?chatId=${encodeURIComponent(roomA.data.id)}`,
    {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        'Content-Type': 'image/png',
      },
      body: png,
    },
  );
  check(image.status, 201, 'entitled member uploads an allowed image');
  const media = await image.json();
  check(
    (
      await request(a, `/chats/${encodeURIComponent(roomA.data.id)}/messages`, {
        id: randomUUID(),
        text: '',
        kind: 'image',
        mediaId: media.id,
      })
    ).status,
    201,
    'uploaded image can be attached to its conversation',
  );
  const fakeOwner = await request(
    c,
    `/chats/${encodeURIComponent(roomA.data.id)}/messages`,
    { id: randomUUID(), text: '', kind: 'image', mediaId: media.id },
  );
  check(
    fakeOwner.status,
    403,
    'another account cannot reuse a paid media attachment',
  );
  check(
    (await request(a, '/history')).data.length > 0,
    true,
    'match history is retained',
  );
  check(
    (
      await request(a, '/billing/checkout', {
        plan: 'plus',
        interval: 'monthly',
        requestId: randomUUID(),
      })
    ).status,
    503,
    'unconfigured billing never starts a fake checkout',
  );
  check(
    (await request(c, '/account', { confirmation: 'WRONG' }, 'DELETE')).status,
    400,
    'deletion requires the exact confirmation',
  );
  check(
    (await request(c, '/account', { confirmation: 'DELETE' }, 'DELETE')).data
      .deleted,
    true,
    'account deletion removes its profile',
  );
  check(
    (await request(c, '/me')).status,
    401,
    'deleted account cannot regain access',
  );
  console.log(`\n${assertions} integration assertions passed.`);
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results/integration.json'),
    JSON.stringify(
      { date: new Date().toISOString(), assertions, passed: true },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await writeFile(join(work, 'worker.log'), logs);
  console.error(`Worker logs saved in ${work}`);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.terminate();
  server.kill();
  await new Promise((resolve) => {
    server.once('exit', resolve);
    setTimeout(resolve, 3000).unref();
  });
}
