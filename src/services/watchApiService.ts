// WatchApiService: the only code that talks to GET http://<watch>/data.
//
// On Android requests go through the WatchNetwork native module, which routes them over the Wi-Fi
// network so mobile data can stay on for cloud sync. Elsewhere they use fetch.

import { NativePollResult, WatchNetwork } from '../../modules/watch-network';
import { watchDataUrl } from '../watch/protocol';

export type PollResult =
  | { ok: true; status: number; body: string; via: 'wifi' | 'default'; latencyMs: number }
  | { ok: false; error: 'timeout' | 'network' | 'http'; detail: string; via: 'wifi' | 'default'; latencyMs: number };

export interface PollConfig {
  host: string;
  intervalMs: number;
  timeoutMs: number;
}

/** Runs one poll at a time and reports each result. */
export interface PollDriver {
  readonly background: boolean;
  start(config: PollConfig, onResult: (r: PollResult) => void): void;
  stop(): void;
}

export async function fetchWithTimeout(host: string, timeoutMs: number, signal?: AbortSignal): Promise<PollResult> {
  const started = Date.now();
  const latency = () => Date.now() - started;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(watchDataUrl(host), { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'http', detail: `The watch answered with status ${res.status}`, via: 'default', latencyMs: latency() };
    return { ok: true, status: res.status, body: await res.text(), via: 'default', latencyMs: latency() };
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, error: 'timeout', detail: 'The watch did not respond in time', via: 'default', latencyMs: latency() };
    return { ok: false, error: 'network', detail: (e as Error).message || 'Could not reach the watch', via: 'default', latencyMs: latency() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Foreground polling with plain timers. The next request is only scheduled after the last ends. */
export class JsPollDriver implements PollDriver {
  readonly background = false;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private session = 0;

  start(config: PollConfig, onResult: (r: PollResult) => void): void {
    this.stop();
    const session = ++this.session;
    const controller = new AbortController();
    this.controller = controller;
    const loop = async () => {
      const result = await fetchWithTimeout(config.host, config.timeoutMs, controller.signal);
      if (session !== this.session) return;
      onResult(result);
      this.timer = setTimeout(loop, config.intervalMs);
    };
    loop();
  }

  stop(): void {
    this.session++;
    this.controller?.abort();
    this.controller = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Android foreground service. Keeps polling with the screen off or the app in the background. */
export class NativePollDriver implements PollDriver {
  readonly background = true;
  private subscription: { remove(): void } | null = null;

  start(config: PollConfig, onResult: (r: PollResult) => void): void {
    this.stop();
    this.subscription = WatchNetwork!.addListener('onPoll', (r: NativePollResult) => onResult(r));
    WatchNetwork!
      .startMonitoring(watchDataUrl(config.host), config.intervalMs, config.timeoutMs, 'SafeFall AI', 'Connecting to your watch')
      .catch((e: Error) => onResult({ ok: false, error: 'network', detail: e.message, via: 'default', latencyMs: 0 }));
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    WatchNetwork?.stopMonitoring().catch(() => undefined);
  }
}

class WatchApiService {
  createDriver(): PollDriver {
    return WatchNetwork ? new NativePollDriver() : new JsPollDriver();
  }

  /** One request, used by Test Connection. */
  async fetchOnce(host: string, timeoutMs: number): Promise<PollResult> {
    if (WatchNetwork) return WatchNetwork.fetchOnce(watchDataUrl(host), timeoutMs);
    return fetchWithTimeout(host, timeoutMs);
  }

  /** Tells the wearer the truth in the persistent notification. */
  setMonitoringStatus(text: string): void {
    WatchNetwork?.updateMonitoringNotification('SafeFall AI', text).catch(() => undefined);
  }

  async diagnostics() {
    return WatchNetwork ? WatchNetwork.getDiagnostics().catch(() => null) : null;
  }

  openBatterySettings(): void {
    WatchNetwork?.openBatterySettings().catch(() => undefined);
  }
}

export const watchApiService = new WatchApiService();
