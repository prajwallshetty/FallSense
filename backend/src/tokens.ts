// Short-lived access JWTs plus rotating, hashed refresh tokens. Replaying a refresh token that was
// already rotated revokes its whole family, which limits the damage of a stolen token.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Db } from './db';
import { unauthorized } from './errors';

export type AppRole = 'user' | 'caretaker';

export interface Principal {
  subjectId: string;
  role: AppRole;
  credentialId: string;
}

export const ACCESS_TOKEN_TTL_S = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 90;

export function signAccessToken(p: Principal, secret: string): string {
  // `role` and `aud` are the claims Supabase Realtime expects; `app_role` drives the RLS policies.
  return jwt.sign({ role: 'authenticated', app_role: p.role, cid: p.credentialId }, secret, {
    algorithm: 'HS256',
    subject: p.subjectId,
    audience: 'authenticated',
    expiresIn: ACCESS_TOKEN_TTL_S,
  });
}

export function verifyAccessToken(token: string, secret: string): Principal {
  try {
    const c = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'authenticated' }) as jwt.JwtPayload;
    if (!c.sub || (c.app_role !== 'user' && c.app_role !== 'caretaker') || typeof c.cid !== 'string') throw new Error('bad claims');
    return { subjectId: c.sub, role: c.app_role, credentialId: c.cid };
  } catch {
    throw unauthorized();
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function issueRefreshToken(db: Db, credentialId: string, familyId: string = randomUUID()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `insert into refresh_tokens (credential_id, family_id, token_hash, expires_at)
     values ($1, $2, $3, now() + make_interval(days => $4))`,
    [credentialId, familyId, sha256(token), REFRESH_TOKEN_TTL_DAYS],
  );
  return token;
}

export async function rotateRefreshToken(db: Db, token: string): Promise<{ credentialId: string; refreshToken: string }> {
  const rotated = await db.tx(async (tx) => {
    const { rows } = await tx.query<{ id: string; credential_id: string; family_id: string; expired: boolean; revoked_at: Date | null; replaced_at: Date | null }>(
      `select id, credential_id, family_id, expires_at < now() as expired, revoked_at, replaced_at
       from refresh_tokens where token_hash = $1 for update`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row || row.expired || row.revoked_at) return null;
    if (row.replaced_at) {
      // Reuse of a spent token. Returning normally lets this revocation commit; the caller then
      // refuses the request. Throwing here would roll the revocation back.
      await tx.query('update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null', [row.family_id]);
      return null;
    }
    await tx.query('update refresh_tokens set replaced_at = now() where id = $1', [row.id]);
    return { credentialId: row.credential_id, refreshToken: await issueRefreshToken(tx, row.credential_id, row.family_id) };
  });
  if (!rotated) throw unauthorized();
  return rotated;
}

export async function revokeRefreshToken(db: Db, token: string): Promise<void> {
  await db.query(
    `update refresh_tokens set revoked_at = now()
     where family_id = (select family_id from refresh_tokens where token_hash = $1) and revoked_at is null`,
    [sha256(token)],
  );
}
