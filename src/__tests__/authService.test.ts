import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient, ApiError } from '../services/apiClient';
import { AuthService } from '../services/authService';
import { secureStorage } from '../services/secureStorage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const session = (n = 1) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  subject: { id: 'u1', name: 'Asha', role: 'user' as const, calibrationAccess: false },
  links: [{ id: 'c1', name: 'Ravi', relationship: 'son' }],
});

function setup(fetchImpl: (url: string, init: RequestInit) => Promise<Partial<Response>>) {
  const realFetch = global.fetch;
  global.fetch = jest.fn(fetchImpl as never) as typeof fetch;
  const client = new ApiClient('https://api.example.com');
  const auth = new AuthService(client);
  return { client, auth, restore: () => (global.fetch = realFetch) };
}

const json = (status: number, body: unknown): Partial<Response> => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await secureStorage.remove('safefall.refreshToken');
});

describe('login', () => {
  it('sends the code to the backend, and stores no code anywhere', async () => {
    const { auth, restore } = setup(async () => json(200, session()));
    await auth.login(' ABCD-EFGH-JKMN ', 'user');
    const body = JSON.parse(((global.fetch as jest.Mock).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ accessCode: 'ABCD-EFGH-JKMN', role: 'user' });
    const dump = JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()));
    expect(dump).not.toContain('ABCD');
    restore();
  });

  it('keeps tokens out of AsyncStorage: refresh token in the keystore, access token in memory', async () => {
    const { auth, restore } = setup(async () => json(200, session()));
    await auth.login('code', 'user');
    const dump = JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()));
    expect(dump).not.toContain('refresh-1');
    expect(dump).not.toContain('access-1');
    await expect(secureStorage.get('safefall.refreshToken')).resolves.toBe('refresh-1');
    restore();
  });

  it('surfaces the server message for a bad code', async () => {
    const { auth, restore } = setup(async () => json(401, { error: { code: 'invalid_access_code', message: 'That access code was not recognised.' } }));
    await expect(auth.login('nope', 'user')).rejects.toMatchObject({ kind: 'auth', message: 'That access code was not recognised.' });
    restore();
  });
});

describe('restore', () => {
  it('restores a session offline, so monitoring never depends on the server', async () => {
    const { auth, restore } = setup(async () => json(200, session()));
    await auth.login('code', 'user');
    const offline = new AuthService(new ApiClient('https://api.example.com'));
    await expect(offline.restore()).resolves.toMatchObject({ subject: { id: 'u1' } });
    restore();
  });

  it('returns null when nothing is stored', async () => {
    const { auth, restore } = setup(async () => json(200, {}));
    await expect(auth.restore()).resolves.toBeNull();
    restore();
  });
});

describe('token refresh', () => {
  it('refreshes once on a 401, then retries the request', async () => {
    let calls = 0;
    const { auth, client, restore } = setup(async (url) => {
      if (url.endsWith('/v1/auth/login')) return json(200, session(1));
      if (url.endsWith('/v1/auth/refresh')) return json(200, session(2));
      calls++;
      return calls === 1 ? json(401, {}) : json(200, { ok: true });
    });
    await auth.login('code', 'user');
    await expect(client.request('/v1/me')).resolves.toEqual({ ok: true });
    expect(auth.accessToken).toBe('access-2');
    restore();
  });

  it('shares one refresh between concurrent requests, because tokens rotate', async () => {
    let refreshes = 0;
    const seen: string[] = [];
    const { auth, client, restore } = setup(async (url, init) => {
      if (url.endsWith('/v1/auth/login')) return json(200, session(1));
      if (url.endsWith('/v1/auth/refresh')) {
        refreshes++;
        return json(200, session(2));
      }
      const token = (init.headers as Record<string, string>).authorization;
      seen.push(token);
      return token === 'Bearer access-2' ? json(200, {}) : json(401, {});
    });
    await auth.login('code', 'user');
    await Promise.all([client.request('/a'), client.request('/b'), client.request('/c')]);
    expect(refreshes).toBe(1);
    restore();
  });

  it('keeps the session when refresh fails only because the phone is offline', async () => {
    const expired = jest.fn();
    let online = true;
    const { auth, client, restore } = setup(async (url) => {
      if (url.endsWith('/v1/auth/login')) return json(200, session());
      if (!online) throw new TypeError('Network request failed');
      return json(401, {});
    });
    auth.setExpiredHandler(expired);
    await auth.login('code', 'user');
    online = false;
    await expect(client.request('/v1/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).not.toHaveBeenCalled();
    await expect(secureStorage.get('safefall.refreshToken')).resolves.toBe('refresh-1');
    restore();
  });

  it('signs out when the server refuses the session for good', async () => {
    const expired = jest.fn();
    const { auth, client, restore } = setup(async (url) => (url.endsWith('/v1/auth/login') ? json(200, session()) : json(401, { error: { message: 'no' } })));
    auth.setExpiredHandler(expired);
    await auth.login('code', 'user');
    await expect(client.request('/v1/me')).rejects.toMatchObject({ kind: 'auth' });
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(secureStorage.get('safefall.refreshToken')).resolves.toBeNull();
    restore();
  });
});

describe('logout', () => {
  it('clears local tokens even with no internet', async () => {
    let online = true;
    const { auth, restore } = setup(async () => {
      if (!online) throw new TypeError('Network request failed');
      return json(200, session());
    });
    await auth.login('code', 'user');
    online = false;
    await auth.logout();
    await expect(secureStorage.get('safefall.refreshToken')).resolves.toBeNull();
    await expect(auth.restore()).resolves.toBeNull();
    expect(auth.accessToken).toBeNull();
    restore();
  });
});

describe('ApiClient', () => {
  it('fails clearly when this build has no backend', async () => {
    await expect(new ApiClient('').request('/x')).rejects.toMatchObject({ kind: 'unconfigured' });
  });
  it('refuses to send anything to a plain-HTTP server', async () => {
    const mock = jest.fn();
    const real = global.fetch;
    global.fetch = mock as unknown as typeof fetch;
    await expect(new ApiClient('http://api.example.com').request('/x')).rejects.toMatchObject({ kind: 'unconfigured' });
    expect(mock).not.toHaveBeenCalled();
    global.fetch = real;
  });
  it('treats validation failures as permanent and outages as retryable', () => {
    expect(new ApiError('rejected', 'x').permanent).toBe(true);
    expect(new ApiError('network', 'x').permanent).toBe(false);
    expect(new ApiError('server', 'x').permanent).toBe(false);
  });
});
