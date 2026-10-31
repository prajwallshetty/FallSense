// Account provisioning, used by the admin script and by tests. An access code is shown exactly once
// at creation. Only its HMAC is stored, so a lost code is replaced, never recovered.

import { accessCodeLookup, generateAccessCode } from './accessCodes';
import { Db } from './db';

export async function createUser(db: Db, name: string, calibrationAccess = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into users (name, calibration_access) values ($1, $2) returning id', [name, calibrationAccess]);
  return rows[0].id;
}

export async function createCaretaker(db: Db, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into caretakers (name) values ($1) returning id', [name]);
  return rows[0].id;
}

export async function linkCaretaker(db: Db, userId: string, caretakerId: string, relationship = ''): Promise<void> {
  await db.query(
    `insert into user_caretaker_links (user_id, caretaker_id, relationship) values ($1, $2, $3)
     on conflict (user_id, caretaker_id) do update set relationship = excluded.relationship`,
    [userId, caretakerId, relationship],
  );
}

export async function issueAccessCode(db: Db, pepper: string, role: 'user' | 'caretaker', subjectId: string, label = '', expiresAt: Date | null = null): Promise<string> {
  const code = generateAccessCode();
  await db.query(
    `insert into access_credentials (role, user_id, caretaker_id, code_lookup, label, expires_at) values ($1, $2, $3, $4, $5, $6)`,
    [role, role === 'user' ? subjectId : null, role === 'caretaker' ? subjectId : null, accessCodeLookup(code, pepper), label, expiresAt],
  );
  return code;
}
