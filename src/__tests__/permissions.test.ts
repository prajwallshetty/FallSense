import { PermissionsAndroid } from 'react-native';
import { requiredBlePermissions, summarize } from '../services/permissions';

const G = PermissionsAndroid.RESULTS.GRANTED;
const D = PermissionsAndroid.RESULTS.DENIED;
const N = PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

describe('Bluetooth permissions', () => {
  it('requires scan + connect + fine location on Android 12+', () => {
    expect(requiredBlePermissions('android', 33)).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.ACCESS_FINE_LOCATION',
    ]);
  });
  it('requires only fine location on Android 6-11', () => {
    expect(requiredBlePermissions('android', 30)).toEqual(['android.permission.ACCESS_FINE_LOCATION']);
  });
  it('requires nothing at runtime on iOS (handled by the BLE manager state)', () => {
    expect(requiredBlePermissions('ios', '17.0')).toEqual([]);
  });

  it('reports granted when everything is allowed', () => {
    expect(summarize({ a: G, b: G })).toEqual({ granted: true, blocked: false, missing: [], message: null });
  });
  it('names the missing permissions in plain language', () => {
    const r = summarize({ 'android.permission.BLUETOOTH_SCAN': D, 'android.permission.BLUETOOTH_CONNECT': G });
    expect(r.granted).toBe(false);
    expect(r.blocked).toBe(false);
    expect(r.message).toContain('Nearby devices (scan)');
  });
  it('detects "don\'t ask again" and points to system settings', () => {
    const r = summarize({ 'android.permission.ACCESS_FINE_LOCATION': N });
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/Settings/);
  });
});
