// SafeFall AI HTTP API. Every route derives identity from the verified token, never from the body.

import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { accessCodeLookup } from './accessCodes';
import { Config } from './config';
import { Db } from './db';
import { ApiError, forbidden, unauthorized } from './errors';
import { acknowledgeIncident, assertCanViewUser, getIncident, IncidentFilter, listIncidents, upsertIncident } from './incidents';
import { dispatchIncident, retryPendingNotifications } from './notifications';
import { PushSender } from './push/sender';
import { ACCESS_TOKEN_TTL_S, AppRole, issueRefreshToken, Principal, revokeRefreshToken, rotateRefreshToken, signAccessToken, verifyAccessToken } from './tokens';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

const finite = z.number().finite().min(-1e6).max(1e6);
const epoch = z.number().int().positive().max(4_102_444_800);
const uuid = z.string().uuid();

const loginBody = z.object({ accessCode: z.string().min(4).max(64), role: z.enum(['user', 'caretaker']) });
const refreshBody = z.object({ refreshToken: z.string().min(16).max(256) });
const readingsBody = z.object({
  readings: z.array(z.object({ epoch, x: finite, y: finite, z: finite })).min(1).max(500),
});
const statusBody = z.object({
  watchConnectionStatus: z.enum(['connected', 'connecting', 'disconnected', 'error', 'idle']),
  safetyState: z.string().min(1).max(40),
  lastSync: z.number().int().positive().nullable(),
  latest: z.object({ epoch, x: finite, y: finite, z: finite }).nullable(),
});
const incidentBody = z.object({
  clientEventId: z.string().min(1).max(160),
  clientVersion: z.number().int().positive(),
  eventTimestamp: z.number().int().positive(),
  eventType: z.enum(['fall', 'manual_sos']),
  detectionStatus: z.enum(['NORMAL', 'UNUSUAL_MOVEMENT', 'POSSIBLE_FALL', 'FALL_VERIFICATION', 'CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE', 'FALSE_ALARM', 'SENSOR_UNAVAILABLE']),
  detectionScore: z.number().finite().min(0).max(1).nullable(),
  sensorQuality: z.enum(['good', 'degraded', 'poor']).nullable(),
  movementClassification: z.string().max(40).nullable(),
  incidentState: z.enum(['possible_fall', 'countdown', 'escalated', 'acknowledged', 'cancelled', 'resolved']),
  finalUserResponse: z.enum(['im_ok', 'requested_help', 'no_response']).nullable(),
  details: z.record(z.string(), z.unknown()).default({}),
});
const pushBody = z.object({ token: z.string().min(16).max(4096), platform: z.enum(['android', 'ios']) });
const filterQuery = z.object({
  filter: z.enum(['all', 'possible', 'confirmed', 'acknowledged', 'unacknowledged', 'false_alarm']).default('all'),
  userId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

interface Subject {
  id: string;
  name: string;
  role: AppRole;
  calibrationAccess: boolean;
}

async function loadSubject(db: Db, credentialId: string): Promise<{ subject: Subject; principal: Principal } | null> {
  const { rows } = await db.query<{ role: AppRole; id: string; name: string; calibration_access: boolean | null }>(
    `select a.role, coalesce(a.user_id, a.caretaker_id) as id, coalesce(u.name, c.name) as name, u.calibration_access
     from access_credentials a left join users u on u.id = a.user_id left join caretakers c on c.id = a.caretaker_id
     where a.id = $1 and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())`,
    [credentialId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    subject: { id: row.id, name: row.name, role: row.role, calibrationAccess: !!row.calibration_access },
    principal: { subjectId: row.id, role: row.role, credentialId },
  };
}

async function linksFor(db: Db, s: Subject) {
  const { rows } = await db.query<{ id: string; name: string; relationship: string }>(
    s.role === 'user'
      ? `select c.id, c.name, l.relationship from user_caretaker_links l join caretakers c on c.id = l.caretaker_id where l.user_id = $1 order by c.name`
      : `select u.id, u.name, l.relationship from user_caretaker_links l join users u on u.id = l.user_id where l.caretaker_id = $1 order by u.name`,
    [s.id],
  );
  return rows;
}

export interface AppDeps {
  db: Db;
  config: Pick<Config, 'jwtSecret' | 'accessCodePepper' | 'requireHttps' | 'trustProxyHops' | 'corsOrigins' | 'loginRateLimit'>;
  push: PushSender;
  /** Runs work after the response, so a slow push provider never delays the phone. */
  background?: (work: Promise<unknown>) => void;
}

export function createApp({ db, config, push, background }: AppDeps) {
  const app = express();
  const defer = background ?? ((work: Promise<unknown>) => void work.catch((e) => console.error('background task failed', e)));

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use((req, _res, next) => {
    if (config.requireHttps && !req.secure) next(new ApiError(426, 'https_required', 'This API only accepts HTTPS.'));
    else next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const requireAuth: RequestHandler = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    req.principal = verifyAccessToken(header.slice(7), config.jwtSecret);
    next();
  };
  const requireRole =
    (role: AppRole): RequestHandler =>
    (req, _res, next) => {
      if (req.principal?.role !== role) throw forbidden();
      next();
    };
  // A revoked code must stop working immediately, not when its access token expires.
  const requireLive: RequestHandler = async (req, _res, next) => {
    if (!(await loadSubject(db, req.principal!.credentialId))) throw unauthorized();
    next();
  };

  const loginLimiter = rateLimit({
    windowMs: config.loginRateLimit.windowMs,
    limit: config.loginRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait and try again.' } },
  });

  const sessionFor = async (credentialId: string, refreshToken: string) => {
    const loaded = await loadSubject(db, credentialId);
    if (!loaded) throw unauthorized();
    return {
      accessToken: signAccessToken(loaded.principal, config.jwtSecret),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_S,
      subject: loaded.subject,
      links: await linksFor(db, loaded.subject),
    };
  };

  app.post('/v1/auth/login', loginLimiter, async (req, res) => {
    const { accessCode, role } = loginBody.parse(req.body);
    const lookup = accessCodeLookup(accessCode, config.accessCodePepper);
    const { rows } = await db.query<{ id: string }>(
      `update access_credentials set last_used_at = now()
       where code_lookup = $1 and role = $2 and revoked_at is null and (expires_at is null or expires_at > now())
       returning id`,
      [lookup, role],
    );
    // One message for unknown, revoked, expired and wrong-role codes, so none can be probed.
    if (!rows[0]) throw new ApiError(401, 'invalid_access_code', 'That access code was not recognised.');
    res.json(await sessionFor(rows[0].id, await issueRefreshToken(db, rows[0].id)));
  });

  app.post('/v1/auth/refresh', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body);
    const rotated = await rotateRefreshToken(db, refreshToken);
    res.json(await sessionFor(rotated.credentialId, rotated.refreshToken));
  });

  app.post('/v1/auth/logout', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body);
    await revokeRefreshToken(db, refreshToken);
    res.status(204).end();
  });

  app.get('/v1/me', requireAuth, requireLive, async (req, res) => {
    const loaded = await loadSubject(db, req.principal!.credentialId);
    if (!loaded) throw unauthorized();
    res.json({ subject: loaded.subject, links: await linksFor(db, loaded.subject) });
  });

  // ---------------------------------------------------------------- phone gateway (user role)
  app.post('/v1/sync/readings', requireAuth, requireLive, requireRole('user'), async (req, res) => {
    const { readings } = readingsBody.parse(req.body);
    const { rows } = await db.query(
      `insert into sensor_readings (user_id, "timestamp", watch_epoch, x, y, z)
       select $1, to_timestamp(r.epoch), r.epoch, r.x, r.y, r.z
       from jsonb_to_recordset($2::jsonb) as r(epoch bigint, x double precision, y double precision, z double precision)
       on conflict (user_id, watch_epoch, x, y, z) do nothing
       returning id`,
      [req.principal!.subjectId, JSON.stringify(readings)],
    );
    res.json({ received: readings.length, stored: rows.length });
  });

  app.post('/v1/sync/status', requireAuth, requireLive, requireRole('user'), async (req, res) => {
    const b = statusBody.parse(req.body);
    await db.query(
      `insert into device_status (user_id, watch_connection_status, safety_state, last_sync, latest_epoch, latest_x, latest_y, latest_z, updated_at)
       values ($1, $2, $3, case when $4::bigint is null then null else to_timestamp($4::bigint / 1000.0) end, $5, $6, $7, $8, now())
       on conflict (user_id) do update set
         watch_connection_status = excluded.watch_connection_status,
         safety_state = excluded.safety_state,
         last_sync = coalesce(excluded.last_sync, device_status.last_sync),
         latest_epoch = coalesce(excluded.latest_epoch, device_status.latest_epoch),
         latest_x = coalesce(excluded.latest_x, device_status.latest_x),
         latest_y = coalesce(excluded.latest_y, device_status.latest_y),
         latest_z = coalesce(excluded.latest_z, device_status.latest_z),
         updated_at = now()`,
      [req.principal!.subjectId, b.watchConnectionStatus, b.safetyState, b.lastSync, b.latest?.epoch ?? null, b.latest?.x ?? null, b.latest?.y ?? null, b.latest?.z ?? null],
    );
    res.status(204).end();
  });

  app.post('/v1/incidents', requireAuth, requireLive, requireRole('user'), async (req, res) => {
    const body = incidentBody.parse(req.body);
    const result = await upsertIncident(db, req.principal!.subjectId, body);
    if (result.shouldDispatch) defer(dispatchIncident(db, push, result.id));
    res.json(await getIncident(db, req.principal!, result.id));
  });

  // ---------------------------------------------------------------- shared reads
  app.get('/v1/incidents', requireAuth, requireLive, async (req, res) => {
    const q = filterQuery.parse(req.query);
    const p = req.principal!;
    let userIds: string[];
    if (q.userId) {
      await assertCanViewUser(db, p, q.userId);
      userIds = [q.userId];
    } else if (p.role === 'user') {
      userIds = [p.subjectId];
    } else {
      const links = await db.query<{ user_id: string }>('select user_id from user_caretaker_links where caretaker_id = $1', [p.subjectId]);
      userIds = links.rows.map((r) => r.user_id);
    }
    res.json({ incidents: await listIncidents(db, userIds, q.filter as IncidentFilter, q.limit) });
  });

  app.get('/v1/incidents/:id', requireAuth, requireLive, async (req, res) => {
    res.json(await getIncident(db, req.principal!, uuid.parse(req.params.id)));
  });

  app.post('/v1/incidents/:id/acknowledge', requireAuth, requireLive, requireRole('caretaker'), async (req, res) => {
    res.json(await acknowledgeIncident(db, req.principal!, uuid.parse(req.params.id)));
  });

  // ---------------------------------------------------------------- caretaker
  app.get('/v1/caretaker/overview', requireAuth, requireLive, requireRole('caretaker'), async (req, res) => {
    const { rows: users } = await db.query<{ id: string; name: string; relationship: string }>(
      `select u.id, u.name, l.relationship from user_caretaker_links l join users u on u.id = l.user_id where l.caretaker_id = $1 order by u.name`,
      [req.principal!.subjectId],
    );
    const overview = [];
    for (const u of users) {
      const status = await db.query('select * from device_status where user_id = $1', [u.id]);
      overview.push({ user: u, status: status.rows[0] ?? null, recentIncidents: await listIncidents(db, [u.id], 'all', 10) });
    }
    res.json({ overview });
  });

  app.post('/v1/push/register', requireAuth, requireLive, requireRole('caretaker'), async (req, res) => {
    const { token, platform } = pushBody.parse(req.body);
    const caretakerId = req.principal!.subjectId;
    await db.query(
      `insert into push_tokens (caretaker_id, token, platform) values ($1, $2, $3)
       on conflict (token) do update set caretaker_id = excluded.caretaker_id, platform = excluded.platform, updated_at = now()`,
      [caretakerId, token, platform],
    );
    defer(retryPendingNotifications(db, push, caretakerId));
    res.status(204).end();
  });

  app.post('/v1/push/unregister', requireAuth, requireLive, requireRole('caretaker'), async (req, res) => {
    const { token } = pushBody.pick({ token: true }).parse(req.body);
    await db.query('delete from push_tokens where token = $1 and caretaker_id = $2', [token, req.principal!.subjectId]);
    res.status(204).end();
  });

  app.post('/v1/notifications/:id/received', requireAuth, requireLive, requireRole('caretaker'), async (req, res) => {
    await db.query(
      `update notification_logs set delivery_status = 'device_received', device_received_at = coalesce(device_received_at, now())
       where id = $1 and recipient_id = $2 and delivery_status in ('provider_accepted', 'device_received')`,
      [uuid.parse(req.params.id), req.principal!.subjectId],
    );
    res.status(204).end();
  });

  app.use((_req, _res, next) => next(new ApiError(404, 'not_found', 'Not found.')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
    } else if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'That request was not valid.', issues: err.issues.slice(0, 5).map((i) => ({ path: i.path, message: i.message })) } });
    } else if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid_json', message: 'That request was not valid JSON.' } });
    } else {
      console.error('unhandled error', err);
      res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.' } });
    }
  });

  return app;
}
