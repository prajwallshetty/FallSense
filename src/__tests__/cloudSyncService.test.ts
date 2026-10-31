import { ApiClient, ApiError, isAllowedApiUrl } from '../services/apiClient';
import { CloudSyncService } from '../services/cloudSyncService';
import { useCloudStore } from '../store/cloudStore';
import { useIncidentStore } from '../store/incidentStore';
import { useWatchStore } from '../store/watchStore';
import { Sample } from '../services/sensorService';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

const owner = { uid: 'u1', name: 'Asha' };

const sample = (receivedAt: number, epoch = Math.floor(receivedAt / 1000)): Sample => ({ epoch, x: 0.1, y: -0.2, z: 0.8, receivedAt, magnitude: 0.83, smoothed: 0.83, jerk: 0, dt: 1 });

function setup(handler: (path: string, opts: { body?: unknown }) => unknown) {
  const calls: { path: string; body: any }[] = [];
  const client = {
    request: jest.fn(async (path: string, opts: { body?: unknown } = {}) => {
      calls.push({ path, body: opts.body });
      return handler(path, opts);
    }),
  } as unknown as ApiClient;
  let t = 1_793_363_000_000;
  const svc = new CloudSyncService(client, { intervalMs: 15_000, maxQueuedReadings: 5, maxBatch: 3 }, () => t);
  return { svc, calls, advance: (ms: number) => (t += ms), now: () => t };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const cloud = () => useCloudStore.getState();
const inc = () => useIncidentStore.getState();
const ok = (path: string) => (path === '/v1/incidents' ? { client_event_id: 'x', acknowledged_at: null } : path.startsWith('/v1/incidents?') ? { incidents: [] } : {});
const offline = () => {
  throw new ApiError('network', 'Network request failed');
};

let active: CloudSyncService | null = null;
const use = (svc: CloudSyncService) => (active = svc);

beforeEach(() => {
  inc().reset();
  cloud().reset();
  useWatchStore.getState().resetLive();
});
afterEach(() => {
  active?.stop();
  active = null;
});

describe('honest status', () => {
  it('reports online only after the server confirms an upload', async () => {
    const { svc, now } = setup(ok);
    use(svc).start();
    expect(cloud().status).toBe('connecting');
    expect(cloud().lastSuccessAt).toBeNull();
    await flush();
    expect(cloud().status).toBe('online');
    expect(cloud().lastSuccessAt).toBe(now());
  });

  it('reports offline, and no success time, when the internet is unreachable', async () => {
    const { svc } = setup(offline);
    use(svc).start();
    await flush();
    expect(cloud().status).toBe('offline');
    expect(cloud().lastSuccessAt).toBeNull();
    expect(cloud().message).toMatch(/saved/);
  });

  it('separates a server refusal from being offline', async () => {
    const { svc } = setup(() => {
      throw new ApiError('server', 'Server error 500', 500);
    });
    use(svc).start();
    await flush();
    expect(cloud().status).toBe('error');
  });

  it('does not touch lastSuccessAt when later uploads fail', async () => {
    let up = true;
    const { svc, advance } = setup((p) => (up ? ok(p) : offline()));
    use(svc).start();
    await flush();
    const first = cloud().lastSuccessAt;
    up = false;
    advance(16_000);
    svc.tick(first! + 16_000);
    await flush();
    expect(cloud().status).toBe('offline');
    expect(cloud().lastSuccessAt).toBe(first);
  });
});

describe('incident queue', () => {
  it('uploads immediately, without waiting for the sync interval', async () => {
    const { svc, calls } = setup(ok);
    use(svc).start();
    await flush();
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    await flush();
    expect(calls.some((c) => c.path === '/v1/incidents' && c.body.clientEventId === 'sos-1')).toBe(true);
    expect(inc().active!.syncedVersion).toBe(inc().active!.version);
  });

  it('keeps an incident while offline, then sends it when the internet returns', async () => {
    let up = false;
    const { svc, calls, advance, now } = setup((p) => (up ? ok(p) : offline()));
    use(svc).start();
    await flush();
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    await flush();
    expect(inc().active!.syncedVersion).toBe(0);
    expect(cloud().pendingIncidents).toBe(1);

    up = true;
    advance(61_000);
    svc.tick(now());
    await flush();
    expect(inc().active!.syncedVersion).toBe(inc().active!.version);
    expect(cloud().pendingIncidents).toBe(0);
    expect(calls.filter((c) => c.path === '/v1/incidents').length).toBeGreaterThanOrEqual(2);
  });

  it('backs off between failed attempts rather than hammering the server', async () => {
    const { svc, calls, advance, now } = setup(offline);
    use(svc).start();
    await flush();
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    await flush();
    const before = calls.length;
    advance(500);
    svc.tick(now());
    await flush();
    expect(calls.length).toBe(before);
  });

  it('does not let one permanently rejected incident block the others', async () => {
    const { svc } = setup((path, opts) => {
      if (path === '/v1/incidents' && (opts.body as { clientEventId: string }).clientEventId === 'bad') throw new ApiError('rejected', 'Invalid', 400);
      return ok(path);
    });
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'bad' });
    inc().dispatch({ type: 'RESOLVE', now: 2000, by: 'u1', resolution: 'assisted' });
    inc().dispatch({ type: 'MANUAL_SOS', now: 3000, owner, id: 'good' });
    use(svc).start();
    await flush();
    expect(inc().active!.syncedVersion).toBe(inc().active!.version);
  });

  it('flush reports what is still unsent, for the sign-out warning', async () => {
    const { svc } = setup(offline);
    use(svc).start();
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    await expect(svc.flush(10)).resolves.toBe(1);
  });

  it('brings a caretaker acknowledgment to the wearer', async () => {
    const { svc, advance, now } = setup((path) => {
      if (path.startsWith('/v1/incidents?')) {
        return { incidents: [{ client_event_id: 'sos-1', acknowledged_at: '2026-10-30T12:40:00Z', acknowledged_by: 'c1', acknowledged_by_name: 'Ravi' }] };
      }
      return ok(path);
    });
    use(svc).start();
    await flush();
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    await flush();
    advance(16_000);
    svc.tick(now());
    await flush();
    expect(inc().active!.state).toBe('acknowledged');
    expect(inc().active!.acknowledgedBy?.name).toBe('Ravi');
  });
});

describe('readings', () => {
  it('downsamples to the cloud interval, independent of the polling rate', () => {
    const { svc, now } = setup(ok);
    use(svc).start();
    const t = now();
    for (let i = 0; i < 60; i++) svc.addSample(sample(t + i * 1000));
    expect(cloud().pendingReadings).toBe(4);
  });

  it('drops only the oldest readings when the offline queue is full', async () => {
    const { svc, now, calls, advance } = setup(offline);
    use(svc).start();
    await flush();
    const t = now();
    for (let i = 0; i < 8; i++) svc.addSample(sample(t + i * 15_000));
    expect(cloud().pendingReadings).toBe(5);
    (svc as unknown as { client: ApiClient }).client.request = jest.fn(async (path: string, opts: { body?: unknown } = {}) => {
      calls.push({ path, body: opts.body });
      return ok(path);
    }) as ApiClient['request'];
    advance(120_000);
    svc.tick(now());
    await flush();
    const sent = calls.filter((c) => c.path === '/v1/sync/readings').flatMap((c) => c.body.readings);
    expect(sent.map((r: { epoch: number }) => r.epoch)).toEqual([3, 4, 5, 6, 7].map((i) => Math.floor((t + i * 15_000) / 1000)));
  });

  it('sends the exact watch fields and invents none', async () => {
    const { svc, calls, now } = setup(ok);
    use(svc).start();
    await flush();
    svc.addSample(sample(now()));
    (svc as unknown as { nextIntervalAt: number }).nextIntervalAt = 0;
    svc.tick(now());
    await flush();
    const batch = calls.find((c) => c.path === '/v1/sync/readings')!.body.readings;
    expect(Object.keys(batch[0]).sort()).toEqual(['epoch', 'x', 'y', 'z']);
  });
});

describe('status', () => {
  it('never reports a stale connection as connected', async () => {
    useWatchStore.getState().patch({ connection: 'connected', isStale: true });
    const { svc, calls } = setup(ok);
    use(svc).start();
    await flush();
    expect(calls.find((c) => c.path === '/v1/sync/status')!.body.watchConnectionStatus).toBe('disconnected');
  });

  it('uploads the safety state supplied by detection', async () => {
    const { svc, calls } = setup(ok);
    svc.setSafetyStateSource(() => 'NORMAL');
    use(svc).start();
    await flush();
    expect(calls.find((c) => c.path === '/v1/sync/status')!.body.safetyState).toBe('NORMAL');
  });
});

describe('isAllowedApiUrl', () => {
  it.each(['https://api.safefall.app', 'https://x.y/z', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://10.0.2.2:8787'])('allows %s', (u) => {
    expect(isAllowedApiUrl(u)).toBe(true);
  });
  it.each(['http://api.safefall.app', 'http://192.168.1.5:8787', 'ftp://x', '', 'http://localhost.evil.com'])('refuses %s', (u) => {
    expect(isAllowedApiUrl(u)).toBe(false);
  });
});
