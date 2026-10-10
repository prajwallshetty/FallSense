import { formatPhone, linkCodeFromBytes, LINK_CODE_ALPHABET, normalizeLinkCode, normalizePhone, validateEmail, validateName, validatePassword } from '../utils/validation';

describe('normalizePhone', () => {
  it.each([
    ['+91 98765 43210', '+919876543210'],
    ['+1 (555) 123-4567', '+15551234567'],
    ['0044 20 7946 0958', '+442079460958'],
    ['+49.30.1234567', '+49301234567'],
  ])('accepts %s', (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, value: expected });
  });

  it('applies the default country code and strips the trunk 0', () => {
    expect(normalizePhone('09876543210', '91')).toEqual({ ok: true, value: '+919876543210' });
  });

  it.each(['', 'abc', '12345', '+0123456789', '+12345678901234567', '98+7654321', '+1 555 CALL NOW'])('rejects %p', (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });

  it('requires a country code when no default is configured', () => {
    const r = normalizePhone('9876543210');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/country code/);
  });

  it('formats E.164 for display', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('not a phone')).toBe('not a phone');
  });
});

describe('other validators', () => {
  it('validates email and lower-cases it', () => {
    expect(validateEmail(' A@B.co ')).toEqual({ ok: true, value: 'a@b.co' });
    expect(validateEmail('a@b').ok).toBe(false);
  });
  it('requires a reasonably strong password', () => {
    expect(validatePassword('short1').ok).toBe(false);
    expect(validatePassword('longpassword').ok).toBe(false);
    expect(validatePassword('longpass1').ok).toBe(true);
  });
  it('trims and limits names', () => {
    expect(validateName('  Asha   Rao ')).toEqual({ ok: true, value: 'Asha Rao' });
    expect(validateName('x'.repeat(81)).ok).toBe(false);
  });
});

describe('link codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    const code = linkCodeFromBytes(Uint8Array.from([0, 30, 31, 255, 7, 8, 9, 10]));
    expect(code).toHaveLength(8);
    expect([...code].every((c) => LINK_CODE_ALPHABET.includes(c))).toBe(true);
  });
  it('normalises user input', () => {
    expect(normalizeLinkCode('abcd-efgh')).toEqual({ ok: true, value: 'ABCDEFGH' });
    expect(normalizeLinkCode('ABCD0FGH').ok).toBe(false);
    expect(normalizeLinkCode('ABC').ok).toBe(false);
  });
});
