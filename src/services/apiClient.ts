// HTTP client for the SafeFall cloud API. Refuses non-HTTPS URLs, except addresses that can only
// ever reach this device or a local emulator's host. On a 401 it refreshes once and retries.

import { env } from '../config/env';

export type ApiFailure = 'network' | 'timeout' | 'auth' | 'rejected' | 'server' | 'unconfigured';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiFailure,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request can never succeed as sent, so retrying would only repeat the failure. */
  get permanent(): boolean {
    return this.kind === 'rejected' || this.kind === 'unconfigured';
  }
}

const LOCAL_HOSTS = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/;

export function isAllowedApiUrl(url: string): boolean {
  return /^https:\/\/[^/\s]+/.test(url) || LOCAL_HOSTS.test(url);
}

export interface TokenSource {
  accessToken(): string | null;
  /** Gets a new access token. Returns null when the session can no longer be renewed. */
  refresh(): Promise<string | null>;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiClient {
  private tokens: TokenSource | null = null;

  constructor(private readonly baseUrl: string) {}

  get configured(): boolean {
    return !!this.baseUrl && isAllowedApiUrl(this.baseUrl);
  }

  setTokenSource(tokens: TokenSource | null): void {
    this.tokens = tokens;
  }

  private async send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers: {
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) throw new ApiError('timeout', 'The server took too long to respond.');
      throw new ApiError('network', (e as Error).message || 'Could not reach the server.');
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    if (!this.configured) throw new ApiError('unconfigured', 'The SafeFall cloud service is not configured in this build.');
    const auth = opts.auth !== false;
    let res = await this.send(path, opts, auth ? (this.tokens?.accessToken() ?? null) : null);

    if (res.status === 401 && auth && this.tokens) {
      const fresh = await this.tokens.refresh();
      if (fresh) res = await this.send(path, opts, fresh);
    }
    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    }

    let message = `Server error ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      message = body.error?.message ?? message;
      code = body.error?.code;
    } catch {
      // The body was not JSON. The status is still meaningful.
    }
    if (res.status === 401) throw new ApiError('auth', message, res.status, code);
    if (res.status >= 500 || res.status === 429) throw new ApiError('server', message, res.status, code);
    throw new ApiError('rejected', message, res.status, code);
  }

  /** True only if the API actually answered. Used to report cloud reachability honestly. */
  async ping(timeoutMs = 6000): Promise<boolean> {
    try {
      await this.request('/health', { auth: false, timeoutMs });
      return true;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient(env.apiUrl);
