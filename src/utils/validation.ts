// Input validation shared by forms and services. Pure functions (unit-tested).

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Normalises a phone number to E.164 (+<country><number>).
 * Numbers without a country code use `defaultCountryCode` (digits only, e.g. "91"); without one
 * the user must type the international format.
 */
export function normalizePhone(input: string, defaultCountryCode = ''): ValidationResult<string> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Phone number is required.' };
  if (/[^\d+\s().-]/.test(trimmed)) return { ok: false, error: 'Use digits only, with an optional leading +.' };
  let s = trimmed.replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.indexOf('+') > 0 || (s.match(/\+/g)?.length ?? 0) > 1) {
    return { ok: false, error: 'The + sign can only appear at the start.' };
  }
  if (!s.startsWith('+')) {
    const cc = defaultCountryCode.replace(/\D/g, '');
    if (!cc) return { ok: false, error: 'Include the country code, for example +91 98765 43210.' };
    s = `+${cc}${s.replace(/^0+/, '')}`;
  }
  const digits = s.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return { ok: false, error: 'Enter a valid phone number (8 to 15 digits including country code).' };
  }
  return { ok: true, value: `+${digits}` };
}

/** Pretty-prints E.164 numbers in groups for readability; returns input unchanged otherwise. */
export function formatPhone(e164: string): string {
  if (!/^\+\d{8,15}$/.test(e164)) return e164;
  const d = e164.slice(1);
  return `+${d.slice(0, d.length - 10 || 1)} ${d.slice(-10, -5)} ${d.slice(-5)}`.replace(/\s+/g, ' ').trim();
}

export function validateEmail(input: string): ValidationResult<string> {
  const email = input.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email address is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value: email };
}

export function validatePassword(input: string): ValidationResult<string> {
  if (input.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (!/[A-Za-z]/.test(input) || !/\d/.test(input)) {
    return { ok: false, error: 'Use at least one letter and one number.' };
  }
  return { ok: true, value: input };
}

export function validateName(input: string, field = 'Name', max = 80): ValidationResult<string> {
  const v = input.trim().replace(/\s+/g, ' ');
  if (!v) return { ok: false, error: `${field} is required.` };
  if (v.length > max) return { ok: false, error: `${field} must be ${max} characters or fewer.` };
  return { ok: true, value: v };
}

/** Unambiguous alphabet (no 0/O/1/I/L) for link codes read aloud or typed by older users. */
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const LINK_CODE_LENGTH = 8;

export function linkCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < LINK_CODE_LENGTH) throw new Error('Not enough random bytes');
  let out = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    // 256 % 31 bias is ~0.3%: acceptable for a short-lived, single-use, rate-limited code.
    out += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeLinkCode(input: string): ValidationResult<string> {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== LINK_CODE_LENGTH || [...code].some((c) => !LINK_CODE_ALPHABET.includes(c))) {
    return { ok: false, error: `Enter the ${LINK_CODE_LENGTH}-character code shown on the elderly user's phone.` };
  }
  return { ok: true, value: code };
}
