import { z } from 'zod';
import { ApiError, json, limit, notify, type RowProfile } from './data';
import type { Env } from './env';
export async function supportRoute(
  request: Request,
  env: Env,
  profile: RowProfile,
) {
  if (request.method === 'GET')
    return json(
      (
        await env.DB.prepare(
          'SELECT id,category,message,status,response,createdAt,resolvedAt FROM supportTickets WHERE profileId=? ORDER BY createdAt DESC LIMIT 30',
        )
          .bind(profile.id)
          .all()
      ).results,
    );
  if (request.method !== 'POST') throw new ApiError(405, 'Use GET or POST.');
  await limit(env, `support:${profile.id}`, 5, 3600);
  const body = z
    .object({
      category: z.enum(['help', 'privacy', 'billing', 'appeal']),
      message: z.string().trim().min(10).max(4000),
    })
    .parse(await request.json());
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO supportTickets (id,profileId,category,message,createdAt) VALUES (?,?,?,?,?)',
  )
    .bind(id, profile.id, body.category, body.message, Date.now())
    .run();
  return json({ id, status: 'open' }, 201);
}
export async function moderationRoute(
  request: Request,
  env: Env,
  adminId: string,
) {
  if (!(env.ADMIN_USER_IDS ?? '').split(',').includes(adminId))
    throw new ApiError(403, 'Moderator access required.');
  const path = new URL(request.url).pathname;
  if (path === '/api/admin/reports' && request.method === 'GET')
    return json(
      (
        await env.DB.prepare(
          'SELECT r.*,p.username,p.standing FROM reports r LEFT JOIN profiles p ON p.id=r.reported WHERE r.status=? ORDER BY r.createdAt ASC LIMIT 100',
        )
          .bind('open')
          .all()
      ).results,
    );
  if (path === '/api/admin/support' && request.method === 'GET')
    return json(
      (
        await env.DB.prepare(
          "SELECT t.*,p.username FROM supportTickets t LEFT JOIN profiles p ON p.id=t.profileId WHERE t.status=? ORDER BY CASE p.plan WHEN 'plus' THEN 1 ELSE 0 END DESC,t.createdAt ASC LIMIT 100",
        )
          .bind('open')
          .all()
      ).results,
    );
  if (path === '/api/admin/standing' && request.method === 'POST') {
    const data = z
      .object({
        profileId: z.uuid(),
        standing: z.enum([
          'good',
          'warning',
          'limited',
          'at-risk',
          'suspended',
        ]),
        reason: z.string().trim().min(5).max(1000),
        reportId: z.uuid().optional(),
      })
      .parse(await request.json());
    const target = await env.DB.prepare('SELECT id FROM profiles WHERE id=?')
      .bind(data.profileId)
      .first();
    if (!target) throw new ApiError(404, 'The account no longer exists.');
    const changes = [
      env.DB.prepare('UPDATE profiles SET standing=? WHERE id=?').bind(
        data.standing,
        data.profileId,
      ),
      env.DB.prepare(
        'INSERT INTO moderationAudit (id,adminId,profileId,action,reason,createdAt) VALUES (?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        adminId,
        data.profileId,
        data.standing,
        data.reason,
        Date.now(),
      ),
    ];
    if (data.reportId)
      changes.push(
        env.DB.prepare(
          'UPDATE reports SET status=? WHERE id=? AND reported=?',
        ).bind('resolved', data.reportId, data.profileId),
      );
    if (['suspended', 'limited'].includes(data.standing))
      changes.push(
        env.DB.prepare('DELETE FROM matchQueue WHERE profileId=?').bind(
          data.profileId,
        ),
      );
    await env.DB.batch(changes);
    await notify(
      env,
      data.profileId,
      'standing',
      `Your account standing changed to ${data.standing}: ${data.reason}`,
    );
    return json({ ok: true });
  }
  if (path === '/api/admin/reports/resolve' && request.method === 'POST') {
    const data = z
      .object({
        id: z.uuid(),
        reason: z.string().trim().min(5).max(1000),
      })
      .parse(await request.json());
    const report = await env.DB.prepare(
      'SELECT reported FROM reports WHERE id=?',
    )
      .bind(data.id)
      .first<{ reported: string }>();
    if (!report) throw new ApiError(404, 'Report not found.');
    await env.DB.batch([
      env.DB.prepare('UPDATE reports SET status=? WHERE id=?').bind(
        'resolved',
        data.id,
      ),
      env.DB.prepare(
        'INSERT INTO moderationAudit (id,adminId,profileId,action,reason,createdAt) VALUES (?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        adminId,
        report.reported,
        'report_resolved',
        data.reason,
        Date.now(),
      ),
    ]);
    return json({ ok: true });
  }
  if (path === '/api/admin/support/respond' && request.method === 'POST') {
    const data = z
      .object({
        id: z.uuid(),
        response: z.string().trim().min(5).max(4000),
      })
      .parse(await request.json());
    const ticket = await env.DB.prepare(
      'SELECT profileId FROM supportTickets WHERE id=?',
    )
      .bind(data.id)
      .first<{ profileId: string }>();
    if (!ticket) throw new ApiError(404, 'Support request not found.');
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE supportTickets SET status=?,response=?,resolvedAt=? WHERE id=?',
      ).bind('resolved', data.response, Date.now(), data.id),
      env.DB.prepare(
        'INSERT INTO moderationAudit (id,adminId,profileId,action,reason,createdAt) VALUES (?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        adminId,
        ticket.profileId,
        'support_response',
        data.id,
        Date.now(),
      ),
    ]);
    const exists = await env.DB.prepare('SELECT id FROM profiles WHERE id=?')
      .bind(ticket.profileId)
      .first();
    if (exists)
      await notify(
        env,
        ticket.profileId,
        'support',
        'There is a reply to your support request.',
      );
    return json({ ok: true });
  }
  throw new ApiError(404, 'Moderator action not found.');
}
