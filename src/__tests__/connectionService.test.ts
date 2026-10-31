import { ConnectionService, staleLimitMs } from '../services/connectionService';
import { fetchWithTimeout, JsPollDriver, PollConfig, PollDriver, PollResult } from '../services/watchApiService';
import { DEFAULT_WATCH_SETTINGS, useWatchStore } from '../store/watchStore';

const body = (epoch: number, x = 0.1) => JSON.stringify({ time: '18:01:32', date: 'Fri, 30 Oct 2026', x, y: -0.2, z: -0.8, epoch });
const ok = (b: string): PollResult => ({ ok: true, status: 200, body: b, via: 'wifi', latencyMs: 12 });
const timeout: PollResult = { ok: false, error: 'timeout', detail: 'The watch did not respond in time', via: 'wifi', latencyMs: 3000 };

class FakeDriver implements PollDriver {
  readonly background = true;
  starts: PollConfig[] = [];
  stops = 0;
  start(config: PollConfig) {
    this.starts.push(config);
  }
  stop() {
    this.stops++;
  }
}

function setup() {
  let t = 1793363492000;
  const driver = new FakeDriver();
  const svc = new ConnectionService(() => driver, () => t);
  useWatchStore.setState({ settings: DEFAULT_WATCH_SETTINGS, monitoringEnabled: false });
  useWatchStore.getState().resetLive();
  svc.start();
  return { svc, driver, advance: (ms: number) => (t += ms), state: () => useWatchStore.getState() };
}

describe('connection states', () => {
  it('starts in connecting and does not claim a connection yet', () => {
    expect(setup().state().connection).toBe('connecting');
  });

  it('becomes connected only after a valid response', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492)));
    expect(state().connection).toBe('connected');
    expect(state().lastReading?.x).toBe(0.1);
    expect(state().lastSampleAt).not.toBeNull();
    expect(state().via).toBe('wifi');
  });

  it('stays connected through a brief failure, then reports disconnected', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492)));
    svc.handle(timeout);
    svc.handle(timeout);
    expect(state().connection).toBe('connected');
    svc.handle(timeout);
    expect(state().connection).toBe('disconnected');
    expect(state().message).toMatch(/did not respond/);
  });

  it('keeps the last valid reading visible after disconnecting', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492, 0.42)));
    for (let i = 0; i < 4; i++) svc.handle(timeout);
    expect(state().lastReading?.x).toBe(0.42);
  });

  it('reconnects on the next good response', () => {
    const { svc, state, advance } = setup();
    svc.handle(ok(body(1793363492)));
    for (let i = 0; i < 4; i++) svc.handle(timeout);
    advance(1000);
    svc.handle(ok(body(1793363500)));
    expect(state().connection).toBe('connected');
    expect(state().consecutiveFailures).toBe(0);
  });

  it('reports an error for repeated invalid responses, without crashing', () => {
    const { svc, state } = setup();
    svc.handle(ok('<html>captive portal</html>'));
    svc.handle(ok('{"x":1}'));
    expect(state().connection).toBe('connecting');
    svc.handle(ok('nope'));
    expect(state().connection).toBe('error');
    expect(state().invalidResponses).toBe(3);
    expect(state().lastReading).toBeNull();
  });
});

describe('staleness', () => {
  it('derives the limit from the polling interval, with a floor', () => {
    expect(staleLimitMs({ ...DEFAULT_WATCH_SETTINGS, pollIntervalMs: 1000 })).toBe(5000);
    expect(staleLimitMs({ ...DEFAULT_WATCH_SETTINGS, pollIntervalMs: 5000 })).toBe(20000);
  });

  it('marks data stale when updates stop, and clears it on new data', () => {
    const { svc, state, advance } = setup();
    svc.handle(ok(body(1793363492)));
    advance(6000);
    svc.handle(timeout);
    expect(state().isStale).toBe(true);
    advance(1000);
    svc.handle(ok(body(1793363500)));
    expect(state().isStale).toBe(false);
  });

  it('treats a frozen watch clock as stale even though the watch keeps answering', () => {
    const { svc, state, advance } = setup();
    svc.handle(ok(body(1793363492)));
    for (let i = 0; i < 7; i++) {
      advance(1000);
      svc.handle(ok(body(1793363492)));
    }
    expect(state().connection).toBe('connected');
    expect(state().isStale).toBe(true);
    expect(state().stats.duplicates).toBe(7);
  });

  it('reports sensor loss once, not on every poll', () => {
    const { svc, advance } = setup();
    const lost = jest.fn();
    svc.onSensorLost(lost);
    svc.handle(ok(body(1793363492)));
    for (let i = 0; i < 10; i++) {
      advance(1000);
      svc.handle(timeout);
    }
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('reports loss again after a recovery and a second failure', () => {
    const { svc, advance } = setup();
    const lost = jest.fn();
    svc.onSensorLost(lost);
    svc.handle(ok(body(1793363492)));
    advance(6000);
    svc.handle(timeout);
    svc.handle(ok(body(1793363500)));
    advance(6000);
    svc.handle(timeout);
    expect(lost).toHaveBeenCalledTimes(2);
  });

  it('flags a watch clock far from the phone clock', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492 - 7200)));
    expect(state().clock).toBe('skewed');
  });
});

describe('sample delivery', () => {
  it('delivers each new sample once, in firmware order', () => {
    const { svc, advance } = setup();
    const seen: number[] = [];
    svc.onSample((s) => seen.push(s.epoch));
    svc.handle(ok(body(1793363492)));
    advance(1000);
    svc.handle(ok(body(1793363492)));
    advance(1000);
    svc.handle(ok(body(1793363493)));
    advance(1000);
    svc.handle(ok(body(1793363490)));
    expect(seen).toEqual([1793363492, 1793363493]);
  });

  it('ticks on every poll result, including failures, to drive the app clock', () => {
    const { svc } = setup();
    const tick = jest.fn();
    svc.onTick(tick);
    svc.handle(timeout);
    svc.handle(ok(body(1793363492)));
    expect(tick).toHaveBeenCalledTimes(2);
  });
});

describe('lifecycle', () => {
  it('passes the configured address, interval and timeout to the driver', () => {
    const { driver } = setup();
    expect(driver.starts[0]).toEqual({ host: '192.168.4.1', intervalMs: 1000, timeoutMs: 3000 });
  });

  it('remembers monitoring across restarts but not the connection', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492)));
    expect(state().monitoringEnabled).toBe(true);
    const persisted = useWatchStore.persist.getOptions().partialize!(state()) as object;
    expect(Object.keys(persisted).sort()).toEqual(['monitoringEnabled', 'settings']);
  });

  it('stops the driver and never shows live data after stopping', () => {
    const { svc, driver, state } = setup();
    svc.handle(ok(body(1793363492)));
    svc.stop();
    expect(driver.stops).toBeGreaterThan(0);
    expect(state().connection).toBe('idle');
    expect(state().isStale).toBe(true);
    expect(state().monitoringEnabled).toBe(false);
  });

  it('wipes readings on sign-out', () => {
    const { svc, state } = setup();
    svc.handle(ok(body(1793363492)));
    svc.shutdown();
    expect(state().lastReading).toBeNull();
    expect(state().history).toEqual([]);
    expect(svc.buffer.latest).toBeNull();
  });

  it('polls slowly after a long outage, then returns to the normal rate', () => {
    const { svc, driver } = setup();
    for (let i = 0; i < 30; i++) svc.handle(timeout);
    expect(driver.starts[driver.starts.length - 1].intervalMs).toBe(5000);
    svc.handle(ok(body(1793363492)));
    expect(driver.starts[driver.starts.length - 1].intervalMs).toBe(1000);
  });
});

describe('JsPollDriver', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('never overlaps requests: the next starts after the last finishes', async () => {
    jest.useFakeTimers();
    let active = 0;
    let peak = 0;
    let calls = 0;
    const resolvers: (() => void)[] = [];
    global.fetch = jest.fn(() => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve) => {
        resolvers.push(() => {
          active--;
          resolve({ ok: true, status: 200, text: async () => body(1) } as Response);
        });
      });
    }) as typeof fetch;

    const results: PollResult[] = [];
    const driver = new JsPollDriver();
    driver.start({ host: '192.168.4.1', intervalMs: 100, timeoutMs: 10000 }, (r) => results.push(r));

    await jest.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    resolvers.shift()!();
    await jest.advanceTimersByTimeAsync(150);
    expect(calls).toBe(2);
    expect(peak).toBe(1);
    driver.stop();
  });

  it('stops scheduling and aborts the request when stopped', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    }) as typeof fetch;
    const driver = new JsPollDriver();
    const onResult = jest.fn();
    driver.start({ host: '192.168.4.1', intervalMs: 100, timeoutMs: 10000 }, onResult);
    await jest.advanceTimersByTimeAsync(10);
    driver.stop();
    expect(signal?.aborted).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
  });
});

describe('fetchWithTimeout', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('reports a timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof fetch;
    const p = fetchWithTimeout('192.168.4.1', 1000);
    await jest.advanceTimersByTimeAsync(1100);
    await expect(p).resolves.toMatchObject({ ok: false, error: 'timeout' });
  });

  it('reports a network failure', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as typeof fetch;
    await expect(fetchWithTimeout('192.168.4.1', 1000)).resolves.toMatchObject({ ok: false, error: 'network', detail: 'Network request failed' });
  });

  it('reports an HTTP error status', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 } as Response)) as typeof fetch;
    await expect(fetchWithTimeout('192.168.4.1', 1000)).resolves.toMatchObject({ ok: false, error: 'http' });
  });

  it('calls the exact endpoint', async () => {
    const mock = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' } as Response));
    global.fetch = mock as unknown as typeof fetch;
    await fetchWithTimeout('192.168.4.1', 1000);
    expect((mock.mock.calls[0] as unknown[])[0]).toBe('http://192.168.4.1/data');
  });
});
