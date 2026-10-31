// JS side of the Android watch networking module. Null on iOS, web and Expo Go, where the app falls
// back to plain fetch and foreground-only polling.

import { requireOptionalNativeModule } from 'expo';

export type NativePollResult =
  | { ok: true; status: number; body: string; via: 'wifi' | 'default'; latencyMs: number }
  | { ok: false; error: 'timeout' | 'network' | 'http'; detail: string; via: 'wifi' | 'default'; latencyMs: number };

export interface NetworkDiagnostics {
  /** Android gave the app a Wi-Fi network to reach the watch through. */
  wifiNetworkHeld: boolean;
  wifiHasInternet: boolean;
  /** The network ordinary traffic, including cloud sync, uses right now. */
  defaultTransport: 'wifi' | 'cellular' | 'ethernet' | 'vpn' | 'other' | 'none';
  defaultHasInternet: boolean;
  ignoringBatteryOptimizations: boolean;
  sdkInt: number;
}

interface Subscription {
  remove(): void;
}

interface WatchNetworkModule {
  fetchOnce(url: string, timeoutMs: number): Promise<NativePollResult>;
  startMonitoring(url: string, intervalMs: number, timeoutMs: number, title: string, text: string): Promise<void>;
  stopMonitoring(): Promise<void>;
  updateMonitoringNotification(title: string, text: string): Promise<void>;
  getDiagnostics(): Promise<NetworkDiagnostics>;
  openBatterySettings(): Promise<void>;
  addListener(event: 'onPoll', listener: (result: NativePollResult) => void): Subscription;
}

export const WatchNetwork = requireOptionalNativeModule<WatchNetworkModule>('WatchNetwork');
