/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, afterEach, expect, it } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env } from '../server/env';
import { aiPersonas, matchSchema, type MatchOptions } from '../lib/domain';

const runtime = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const created: string[] = [];
beforeAll(() => applyD1Migrations(runtime.DB, runtime.TEST_MIGRATIONS));
afterEach(async () => {
  for (let offset = 0; offset < created.length; offset += 20) {
    await runtime.DB.batch(
      created
        .slice(offset, offset + 20)
        .flatMap((id) => [
          runtime.DB.prepare('DELETE FROM profiles WHERE id=?').bind(id),
          runtime.DB.prepare('DELETE FROM user WHERE id=?').bind(id),
        ]),
    );
  }
  created.length = 0;
});
const strict = matchSchema.parse({
  interests: ['rare-interest'],
  interestMatch: true,
  waitSeconds: 0,
});
it('bot fill respects an unlimited interest-only wait', async () => {
  const [seeker] = await seed({ queued: false });
  expect(
    await (
      await match(seeker, 'join', { ...strict, partnerType: 'ai' })
    ).json(),
  ).toMatchObject({ status: 'waiting', interestOnly: true });
  const response = await match(seeker, 'join', {
    ...strict,
    interests: [aiPersonas[0].interests[0]],
    partnerType: 'ai',
  });
  expect(await response.json()).toMatchObject({ status: 'matched' });
});
async function seed(
  options: {
    count?: number;
    match?: Partial<MatchOptions>;
    standing?: string;
    plan?: string;
    gender?: string;
    age?: number;
    stale?: boolean;
    queued?: boolean;
  } = {},
) {
  const ids = Array.from({ length: options.count ?? 1 }, () =>
    crypto.randomUUID(),
  );
  created.push(...ids);
  const now = Date.now();
  for (let offset = 0; offset < ids.length; offset += 20) {
    await runtime.DB.batch(
      ids.slice(offset, offset + 20).flatMap((id) => {
        const queries = [
          runtime.DB.prepare(
            'INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)',
          ).bind(id, 'MatchingTester', `${id}@example.invalid`, now, now),
          runtime.DB.prepare(
            'INSERT INTO profiles (id,authId,username,createdAt,lastSeen,acceptedAt,standing,plan,gender) VALUES (?,?,?,?,?,?,?,?,?)',
          ).bind(
            id,
            id,
            'MatchingTester',
            now,
            now,
            now,
            options.standing ?? 'good',
            options.plan ?? 'free',
            options.gender ?? 'undisclosed',
          ),
        ];
        if (options.queued !== false) {
          const match = { ...strict, ...options.match };
          queries.push(
            runtime.DB.prepare(
              'INSERT INTO matchQueue (profileId,mode,options,joinedAt,heartbeatAt) VALUES (?,?,?,?,?)',
            ).bind(
              id,
              match.mode,
              JSON.stringify(match),
              now - (options.age ?? 1000),
              now - (options.stale ? 60000 : 0),
            ),
          );
        }
        return queries;
      }),
    );
  }
  return ids;
}
function match(
  profileId: string,
  action: 'join' | 'status',
  options?: MatchOptions,
  location?: { country?: string; latitude?: number; longitude?: number },
) {
  return runtime.MATCHMAKER.get(
    runtime.MATCHMAKER.idFromName('match:en'),
  ).fetch(
    new Request('https://matchmaker/', {
      method: 'POST',
      body: JSON.stringify({ profileId, action, options, location }),
    }),
  );
}

it('finds a compatible person behind more than 200 incompatible waiting people', async () => {
  await seed({ count: 201, match: { interests: ['unrelated'] }, age: 10000 });
  const [compatible] = await seed();
  const [seeker] = await seed({ queued: false });
  const response = await match(seeker, 'join', strict);
  expect(response.status).toBe(200);
  const result = (await response.json()) as { status: string; chatId: string };
  expect(result.status).toBe('matched');
  const other = await (await match(compatible, 'status')).json();
  expect(other).toEqual({ status: 'matched', chatId: result.chatId });
  const waiting = await runtime.DB.prepare(
    'SELECT COUNT(*) AS count FROM matchQueue WHERE chatId IS NULL',
  ).first<{ count: number }>();
  expect(waiting?.count).toBe(201);
});

it('enforces both gender preferences, blocks, standing, presence, mode, and paid priority', async () => {
  const [seeker] = await seed({
    queued: false,
    plan: 'basic',
    gender: 'woman',
  });
  const [blocked] = await seed({ plan: 'plus', gender: 'man' });
  const [blocksSeeker] = await seed({ plan: 'plus', gender: 'man' });
  await runtime.DB.batch([
    runtime.DB.prepare(
      'INSERT INTO blocks (blocker,blocked,createdAt) VALUES (?,?,?)',
    ).bind(seeker, blocked, Date.now()),
    runtime.DB.prepare(
      'INSERT INTO blocks (blocker,blocked,createdAt) VALUES (?,?,?)',
    ).bind(blocksSeeker, seeker, Date.now()),
  ]);
  await seed({ plan: 'plus', gender: 'woman' });
  await seed({ plan: 'plus', gender: 'man', match: { genderFilter: 'man' } });
  await seed({ plan: 'plus', gender: 'man', standing: 'suspended' });
  await seed({ plan: 'plus', gender: 'man', standing: 'limited' });
  await seed({ plan: 'plus', gender: 'man', stale: true });
  await seed({ plan: 'plus', gender: 'man', match: { partnerType: 'ai' } });
  await seed({ plan: 'plus', gender: 'man', match: { mode: 'voice' } });
  await seed({ gender: 'man', age: 10000 });
  const [preferred] = await seed({
    plan: 'plus',
    gender: 'man',
    match: { genderFilter: 'woman' },
  });
  const result = (await (
    await match(seeker, 'join', { ...strict, genderFilter: 'man' })
  ).json()) as { status: string; chatId: string };
  expect(result.status).toBe('matched');
  expect(await (await match(preferred, 'status')).json()).toEqual({
    status: 'matched',
    chatId: result.chatId,
  });
});

it('keeps either person’s interest deadline and removes a newly restricted waiting account', async () => {
  const [candidate] = await seed({
    match: { interests: ['different'], waitSeconds: 30 },
  });
  const [seeker] = await seed({ queued: false });
  expect(
    await (
      await match(seeker, 'join', { ...strict, interestMatch: false })
    ).json(),
  ).toMatchObject({ status: 'waiting' });
  await runtime.DB.prepare('UPDATE matchQueue SET joinedAt=? WHERE profileId=?')
    .bind(Date.now() - 31000, candidate)
    .run();
  expect(await (await match(seeker, 'status')).json()).toMatchObject({
    status: 'matched',
  });

  const [restricted] = await seed({ standing: 'limited' });
  expect((await match(restricted, 'status')).status).toBe(403);
  expect(
    await runtime.DB.prepare(
      'SELECT profileId FROM matchQueue WHERE profileId=?',
    )
      .bind(restricted)
      .first(),
  ).toBeNull();
});

for (const [plan, cap] of [
  ['free', 3],
  ['basic', 5],
  ['plus', 10],
] as const) {
  it(plan + ' enforces separate include/exclude limits', async () => {
    const [id] = await seed({ queued: false, plan });
    const list = ['AU', 'US', 'GB', 'CA', 'NZ', 'FR', 'DE', 'ES', 'IT', 'JP'];
    expect(
      (
        await match(
          id,
          'join',
          matchSchema.parse({ includeCountries: list.slice(0, cap) }),
        )
      ).status,
    ).toBe(200);
    if (cap < 10)
      expect(
        (
          await match(
            id,
            'join',
            matchSchema.parse({ excludeCountries: list.slice(0, cap + 1) }),
          )
        ).status,
      ).toBe(403);
  });
}
it('country matching is mutual and rejects conflicting preferences', async () => {
  const [a] = await seed({ queued: false }),
    [b] = await seed({ queued: false });
  expect(
    (
      await match(
        a,
        'join',
        matchSchema.parse({
          includeCountries: ['US'],
          excludeCountries: ['US'],
        }),
      )
    ).status,
  ).toBe(400);
  await match(a, 'join', matchSchema.parse({ includeCountries: ['US'] }), {
    country: 'AU',
  });
  expect(
    await (
      await match(b, 'join', matchSchema.parse({ excludeCountries: ['AU'] }), {
        country: 'US',
      })
    ).json(),
  ).toMatchObject({ status: 'waiting' });
  expect(
    await (
      await match(b, 'join', matchSchema.parse({ includeCountries: ['AU'] }), {
        country: 'US',
      })
    ).json(),
  ).toMatchObject({ status: 'matched' });
  const row = await runtime.DB.prepare(
    'SELECT options FROM matchQueue WHERE profileId=?',
  )
    .bind(b)
    .first<{ options: string }>();
  expect(JSON.parse(row!.options).matchLocation).toBeUndefined();
});
it('Near me requires a paid plan and a selected position', async () => {
  const [free] = await seed({ queued: false }),
    [paid] = await seed({ queued: false, plan: 'basic' });
  expect(
    (
      await match(
        free,
        'join',
        matchSchema.parse({
          nearMe: true,
          location: { latitude: 0, longitude: 0 },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await match(paid, 'join', matchSchema.parse({ nearMe: true }))).status,
  ).toBe(400);
});
it('Near me rejects distant peers and matches a nearby peer', async () => {
  const [a] = await seed({ queued: false, plan: 'basic' }),
    [b] = await seed({ queued: false });
  await match(
    a,
    'join',
    matchSchema.parse({
      nearMe: true,
      location: { latitude: -34.9, longitude: 138.6 },
    }),
    { country: 'AU' },
  );
  expect(
    await (
      await match(b, 'join', matchSchema.parse({}), {
        country: 'AU',
        latitude: -33.9,
        longitude: 151.2,
      })
    ).json(),
  ).toMatchObject({ status: 'waiting' });
  expect(
    await (
      await match(b, 'join', matchSchema.parse({}), {
        country: 'AU',
        latitude: -34.8,
        longitude: 138.6,
      })
    ).json(),
  ).toMatchObject({ status: 'matched' });
});
