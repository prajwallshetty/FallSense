// Access codes are 60 bits of randomness in Crockford base32 (no I, L, O, U), so they are readable
// aloud and cannot be guessed. Lookups use an HMAC with a server-side pepper: a stolen database
// alone does not reveal or verify any code.

import { createHmac, randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 12;

export function generateAccessCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/** Accepts lower case, spaces, dashes, and the look-alikes O/I/L people type by mistake. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function accessCodeLookup(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalizeAccessCode(code)).digest('hex');
}
