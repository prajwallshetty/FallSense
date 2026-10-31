// AuthService: access-code sign-in. Codes are validated only by the backend and none are stored in
// the app. The refresh token lives in the OS keystore; the access token stays in memory.
//
// The cached session lets the app reopen offline and keep monitoring. The wearer's safety features
// must not depend on reaching the server at launch.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient, apiClient, ApiError } from './apiClient';
import { secureStorage } from './secureStorage';

export type CloudRole = 'user' | 'caretaker';

export interface CloudSubject {
  id: string;
  name: string;
  role: CloudRole;
  calibrationAccess: boolean;
}

export interface CloudLink {
  id: string;
  name: string;
  relationship: string;
}

export interface CloudSession {
  subject: CloudSubject;
  links: CloudLink[];
}

interface SessionResponse extends CloudSession {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = 'safefall.refreshToken';
const SESSION_KEY = 'safefall.cloudSession';

export class AuthService {
  private access: string | null = null;
  private refreshing: Promise<string | null> | null = null;
  private onExpired: (() => void) | null = null;

  constructor(private readonly client: ApiClient = apiClient) {
    client.setTokenSource({ accessToken: () => this.access, refresh: () => this.refreshAccess() });
  }

  /** Called when the backend refuses the session for good, such as a revoked code. */
  setExpiredHandler(fn: (() => void) | null): void {
    this.onExpired = fn;
  }

  /** The current token, for the Realtime connection. */
  get accessToken(): string | null {
    return this.access;
  }

  private async store(res: SessionResponse): Promise<CloudSession> {
    this.access = res.accessToken;
    await secureStorage.set(REFRESH_KEY, res.refreshToken);
    const session = { subject: res.subject, links: res.links };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async login(accessCode: string, role: CloudRole): Promise<CloudSession> {
    const res = await this.client.request<SessionResponse>('/v1/auth/login', { auth: false, body: { accessCode: accessCode.trim(), role } });
    return this.store(res);
  }

  /** Restores the saved session without needing the network. */
  async restore(): Promise<CloudSession | null> {
    try {
      const [raw, refresh] = await Promise.all([AsyncStorage.getItem(SESSION_KEY), secureStorage.get(REFRESH_KEY)]);
      if (!raw || !refresh) return null;
      return JSON.parse(raw) as CloudSession;
    } catch {
      return null;
    }
  }

  /** Concurrent callers share one refresh: refresh tokens rotate, so a second use would revoke. */
  private refreshAccess(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = await secureStorage.get(REFRESH_KEY).catch(() => null);
    if (!refreshToken) return null;
    try {
      const res = await this.client.request<SessionResponse>('/v1/auth/refresh', { auth: false, body: { refreshToken } });
      await this.store(res);
      return res.accessToken;
    } catch (e) {
      if (e instanceof ApiError && (e.kind === 'auth' || e.kind === 'rejected')) {
        await this.clear();
        this.onExpired?.();
      }
      // A network failure keeps the session: the phone may simply be on the watch hotspot.
      return null;
    }
  }

  /** Refreshes the cached profile and links when the server is reachable. */
  async refreshProfile(): Promise<CloudSession | null> {
    const session = await this.client.request<CloudSession>('/v1/me');
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  private async clear(): Promise<void> {
    this.access = null;
    await Promise.all([secureStorage.remove(REFRESH_KEY).catch(() => undefined), AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined)]);
  }

  async logout(): Promise<void> {
    const refreshToken = await secureStorage.get(REFRESH_KEY).catch(() => null);
    // Revocation is best effort, because sign-out must work offline too.
    if (refreshToken) await this.client.request('/v1/auth/logout', { auth: false, body: { refreshToken } }).catch(() => undefined);
    await this.clear();
  }
}

export const authService = new AuthService();
