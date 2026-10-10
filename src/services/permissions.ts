// Runtime Bluetooth permission handling with human-readable diagnostics.
//
// Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT. Because app.json does not declare
// BLUETOOTH_SCAN as "neverForLocation" (the app legitimately uses location for incidents), Android
// also requires fine location to return scan results.
// Android 6-11: fine location is required for BLE scanning.
// iOS: the system prompts when the BLE manager starts; denial shows up as adapter state "unauthorized".

import { Permission, PermissionsAndroid, Platform } from 'react-native';

export interface BlePermissionResult {
  granted: boolean;
  /** User chose "Don't ask again": must be changed in system settings. */
  blocked: boolean;
  missing: string[];
  message: string | null;
}

const LABELS: Record<string, string> = {
  'android.permission.BLUETOOTH_SCAN': 'Nearby devices (scan)',
  'android.permission.BLUETOOTH_CONNECT': 'Nearby devices (connect)',
  'android.permission.ACCESS_FINE_LOCATION': 'Precise location',
};

export function requiredBlePermissions(os: string = Platform.OS, version: number | string = Platform.Version): Permission[] {
  if (os !== 'android') return [];
  const api = typeof version === 'number' ? version : Number.parseInt(String(version), 10);
  const P = PermissionsAndroid.PERMISSIONS;
  if (api >= 31) return [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.ACCESS_FINE_LOCATION];
  return [P.ACCESS_FINE_LOCATION];
}

export function summarize(results: Record<string, string>): BlePermissionResult {
  const missing = Object.entries(results)
    .filter(([, r]) => r !== PermissionsAndroid.RESULTS.GRANTED)
    .map(([p]) => p);
  const blocked = Object.values(results).some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  if (missing.length === 0) return { granted: true, blocked: false, missing: [], message: null };
  const names = missing.map((m) => LABELS[m] ?? m.split('.').pop()).join(', ');
  return {
    granted: false,
    blocked,
    missing,
    message: blocked
      ? `Permission blocked: ${names}. Open Settings > Apps > SafeFall AI > Permissions to allow it.`
      : `SafeFall AI needs: ${names} to find and connect to your watch.`,
  };
}

export async function checkBlePermissions(): Promise<BlePermissionResult> {
  const perms = requiredBlePermissions();
  if (perms.length === 0) return { granted: true, blocked: false, missing: [], message: null };
  const results: Record<string, string> = {};
  for (const p of perms) {
    results[p] = (await PermissionsAndroid.check(p)) ? PermissionsAndroid.RESULTS.GRANTED : PermissionsAndroid.RESULTS.DENIED;
  }
  return summarize(results);
}

export async function requestBlePermissions(): Promise<BlePermissionResult> {
  const perms = requiredBlePermissions();
  if (perms.length === 0) return { granted: true, blocked: false, missing: [], message: null };
  const results = await PermissionsAndroid.requestMultiple(perms);
  return summarize(results as Record<string, string>);
}
