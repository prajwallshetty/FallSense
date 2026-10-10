/* eslint-disable @typescript-eslint/no-require-imports -- bleService is required after jest.mock setup */
import { resilientSubscription } from '../services/resilientSubscription';
import { DeviceEventType, DeviceState } from '../ble/protocol';
import { initialIncidentsState, reduce } from '../emergency/incidentMachine';

jest.mock('../services/firebase', () => ({ firebaseService: { upsertDeviceStatus: jest.fn(() => Promise.resolve()) } }));
jest.mock('../services/firebaseApp', () => ({ describeFirebaseError: (e: unknown) => String(e) }));
jest.mock('react-native-ble-plx', () => {
  throw new Error('native module missing');
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('resilientSubscription', () => {
  it('resubscribes after a transient error (caregiver link race) and resets on data', () => {
    let calls = 0;
    const handlers: { fail: (e: Error) => void; ok: () => void }[] = [];
    const finalError = jest.fn();
    const unsub = resilientSubscription((fail, ok) => {
      calls++;
      handlers.push({ fail, ok });
      return () => undefined;
    }, finalError, [100, 200]);
    handlers[0].fail(new Error('permission-denied'));
    jest.advanceTimersByTime(100);
    expect(calls).toBe(2);
    handlers[1].ok();
    handlers[1].fail(new Error('again'));
    jest.advanceTimersByTime(100); // attempt counter was reset by data
    expect(calls).toBe(3);
    expect(finalError).not.toHaveBeenCalled();
    unsub();
  });

  it('reports the error once retries are exhausted and stops after unsubscribe', () => {
    let calls = 0;
    let fail: (e: Error) => void = () => undefined;
    const finalError = jest.fn();
    resilientSubscription((f) => { calls++; fail = f; return () => undefined; }, finalError, [100]);
    fail(new Error('denied'));
    jest.advanceTimersByTime(100);
    fail(new Error('denied'));
    expect(finalError).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });
});

describe('waitForAdapter', () => {
  const { waitForAdapter } = require('../services/bleService');
  const transport = (initial: string) => {
    let cb: ((s: string) => void) | null = null;
    return {
      t: { getState: jest.fn(async () => initial), onStateChange: (f: (s: string) => void) => { cb = f; return { remove: () => (cb = null) }; } },
      emit: (s: string) => cb?.(s),
    };
  };

  it('resolves immediately with a settled state', async () => {
    const { t } = transport('powered_off');
    await expect(waitForAdapter(t)).resolves.toBe('powered_off');
  });

  it('waits out "unknown" until the adapter reports a real state', async () => {
    const { t, emit } = transport('unknown');
    const p = waitForAdapter(t, 4000);
    await Promise.resolve();
    emit('powered_on');
    await expect(p).resolves.toBe('powered_on');
  });

  it('times out with the last known state', async () => {
    const { t } = transport('unknown');
    const p = waitForAdapter(t, 4000);
    jest.advanceTimersByTime(4000);
    await expect(p).resolves.toBe('unknown');
  });
});

describe('late watch events', () => {
  it('notes on the incident when an event arrived long after the watch raised it', () => {
    const r = reduce(initialIncidentsState, {
      type: 'DEVICE_EVENT',
      now: 1_000_000,
      owner: { uid: 'u', name: 'A' },
      deviceId: 'd',
      simulated: false,
      lateByMs: 12 * 60_000,
      event: { kind: 'event', eventId: 1, eventType: DeviceEventType.FallConfirmed, deviceState: DeviceState.FallAlarm, peakAccelG: 3, uptimeMs: 1 },
    });
    expect(r.state.active?.state).toBe('countdown');
    expect(r.state.active?.timeline.find((t) => t.type === 'delivered_late')?.detail).toMatch(/12 min/);
  });

  it('does not add a note for prompt events', () => {
    const r = reduce(initialIncidentsState, {
      type: 'DEVICE_EVENT', now: 1, owner: { uid: 'u', name: 'A' }, deviceId: 'd', simulated: false, lateByMs: 500,
      event: { kind: 'event', eventId: 1, eventType: DeviceEventType.SosButton, deviceState: DeviceState.SosAlarm, peakAccelG: 0, uptimeMs: 1 },
    });
    expect(r.state.active?.timeline.some((t) => t.type === 'delivered_late')).toBe(false);
  });
});
