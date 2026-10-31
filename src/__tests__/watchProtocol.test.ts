import { checkWatchClock, parseWatchBody, validateWatchHost, watchDataUrl } from '../watch/protocol';

const CONFIRMED = '{"time":"18:01:32","date":"Fri, 30 Oct 2026","x":-0.353,"y":-0.231,"z":-0.781,"epoch":1793363492}';
const body = (o: Record<string, unknown>) => JSON.stringify({ time: '18:01:32', date: 'Fri, 30 Oct 2026', x: 0.1, y: 0.2, z: 0.3, epoch: 1793363492, ...o });

describe('parseWatchBody', () => {
  it('parses the confirmed firmware response exactly', () => {
    expect(parseWatchBody(CONFIRMED)).toEqual({
      ok: true,
      reading: { time: '18:01:32', date: 'Fri, 30 Oct 2026', x: -0.353, y: -0.231, z: -0.781, epoch: 1793363492 },
    });
  });

  it('keeps zero and negative readings', () => {
    const r = parseWatchBody(body({ x: 0, y: -0, z: -12.5 }));
    expect(r.ok && r.reading.x).toBe(0);
    expect(r.ok && r.reading.z).toBe(-12.5);
  });

  it('does not invent fields and ignores unknown ones', () => {
    const r = parseWatchBody(body({ gyro: 1, battery: 90 }));
    expect(r.ok && Object.keys(r.reading).sort()).toEqual(['date', 'epoch', 'time', 'x', 'y', 'z']);
  });

  it.each([
    ['truncated JSON', '{"time":"18:01', 'invalid_json'],
    ['HTML error page', '<html>', 'invalid_json'],
    ['empty body', '', 'invalid_json'],
    ['array', '[1,2]', 'not_an_object'],
    ['null', 'null', 'not_an_object'],
    ['number', '5', 'not_an_object'],
  ])('rejects %s', (_name, input, error) => {
    expect(parseWatchBody(input)).toMatchObject({ ok: false, error });
  });

  it.each(['time', 'date', 'x', 'y', 'z', 'epoch'])('rejects a response missing %s', (key) => {
    const o = JSON.parse(CONFIRMED);
    delete o[key];
    expect(parseWatchBody(JSON.stringify(o))).toMatchObject({ ok: false, error: 'missing_field' });
  });

  it.each([
    ['a string', { x: '0.1' }],
    ['a boolean', { y: true }],
    ['an absurd value', { z: 1e12 }],
    ['an object', { x: {} }],
  ])('rejects %s as a sensor value', (_name, patch) => {
    expect(parseWatchBody(body(patch))).toMatchObject({ ok: false, error: 'invalid_number' });
  });

  it('rejects NaN, which some firmware prints into JSON', () => {
    expect(parseWatchBody('{"time":"a","date":"b","x":nan,"y":0,"z":0,"epoch":1}')).toMatchObject({ ok: false, error: 'invalid_json' });
  });

  it.each([[0], [-5], [1.5], ['1793363492']])('rejects epoch %s', (epoch) => {
    expect(parseWatchBody(body({ epoch }))).toMatchObject({ ok: false, error: 'invalid_timestamp' });
  });

  it('rejects an empty time string', () => {
    expect(parseWatchBody(body({ time: '' }))).toMatchObject({ ok: false, error: 'missing_field' });
  });
});

describe('checkWatchClock', () => {
  const now = 1793363492000;
  it('accepts a matching clock', () => expect(checkWatchClock(1793363492, now)).toBe('ok'));
  it('flags a clock that was never set', () => expect(checkWatchClock(1000, now)).toBe('unset'));
  it('flags a large skew', () => expect(checkWatchClock(1793363492 - 3600, now)).toBe('skewed'));
});

describe('validateWatchHost', () => {
  it.each(['192.168.4.1', '10.0.2.2', '172.16.0.1', '127.0.0.1:9100', ' 192.168.4.1 '])('accepts %s', (h) => {
    expect(validateWatchHost(h).ok).toBe(true);
  });
  it.each(['8.8.8.8', 'evil.example.com', 'http://192.168.4.1', '192.168.4', '192.168.4.999', '192.168.4.1:99999', '', '172.32.0.1'])('rejects %s', (h) => {
    expect(validateWatchHost(h).ok).toBe(false);
  });
  it('builds the fixed data URL', () => expect(watchDataUrl('192.168.4.1')).toBe('http://192.168.4.1/data'));
});
