// Location capture for incidents and the Location screen.
// Never fabricates coordinates: when a fix is unavailable the caller gets a typed reason.

import * as Location from 'expo-location';
import type { LocationSnapshot } from '../emergency/incidentMachine';

/** A last-known fix older than this is labelled stale. */
export const LOCATION_STALE_MS = 2 * 60 * 1000;
const FRESH_FIX_TIMEOUT_MS = 15_000;

export type LocationPermission = 'granted' | 'denied' | 'blocked' | 'undetermined';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const r = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 5_000);
    if (r === 'timeout' || r.length === 0) return null;
    const a = r[0];
    const parts = [a.name ?? [a.streetNumber, a.street].filter(Boolean).join(' '), a.city, a.region, a.postalCode].filter(
      (p): p is string => !!p && p.trim().length > 0,
    );
    return parts.length ? [...new Set(parts)].join(', ') : null;
  } catch {
    return null;
  }
}

class LocationService {
  async getPermission(): Promise<LocationPermission> {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.granted) return 'granted';
    if (p.status === 'undetermined') return 'undetermined';
    return p.canAskAgain ? 'denied' : 'blocked';
  }

  /** Foreground ("while using the app") permission only; background location is not used. */
  async requestPermission(): Promise<LocationPermission> {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'denied' : 'blocked';
  }

  /**
   * Best-effort location for an incident. Returns a recent last-known fix immediately if
   * available (marked stale when old), then tries for a fresh fix within 15 s.
   * `onUpdate` may be called twice: first with a quick fix, then with a better one.
   */
  async captureIncidentLocation(onUpdate: (s: LocationSnapshot) => void): Promise<void> {
    const now = Date.now();
    try {
      if ((await this.getPermission()) !== 'granted') {
        onUpdate({ status: 'permission_denied', checkedAt: now, message: 'Location permission not granted' });
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        onUpdate({ status: 'services_disabled', checkedAt: now, message: 'Location services are turned off' });
        return;
      }

      let delivered = false;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null);
      if (last) {
        delivered = true;
        onUpdate({
          status: 'ok',
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          accuracyM: last.coords.accuracy ?? null,
          capturedAt: last.timestamp,
          stale: Date.now() - last.timestamp > LOCATION_STALE_MS,
          address: null,
        });
      }

      const fresh = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        FRESH_FIX_TIMEOUT_MS,
      ).catch(() => null);

      if (fresh && fresh !== 'timeout') {
        const address = await reverseGeocode(fresh.coords.latitude, fresh.coords.longitude);
        onUpdate({
          status: 'ok',
          latitude: fresh.coords.latitude,
          longitude: fresh.coords.longitude,
          accuracyM: fresh.coords.accuracy ?? null,
          capturedAt: fresh.timestamp,
          stale: false,
          address,
        });
      } else if (!delivered) {
        onUpdate({
          status: fresh === 'timeout' ? 'timeout' : 'unavailable',
          checkedAt: Date.now(),
          message: fresh === 'timeout' ? 'No GPS fix within 15 seconds' : 'Location could not be determined',
        });
      }
    } catch (e) {
      onUpdate({ status: 'unavailable', checkedAt: Date.now(), message: (e as Error).message });
    }
  }

  /** One-off fix for the Location screen. */
  async getCurrentFix(): Promise<LocationSnapshot> {
    let result: LocationSnapshot = { status: 'unavailable', checkedAt: Date.now() };
    await this.captureIncidentLocation((s) => {
      result = s;
    });
    return result;
  }
}

export const locationService = new LocationService();

export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
