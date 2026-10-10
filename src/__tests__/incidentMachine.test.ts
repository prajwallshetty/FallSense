import { DeviceEventType, DeviceState, EventPacket } from '../ble/protocol';
import {
  Action,
  canTransition,
  DEFAULT_CONFIG,
  Effect,
  incidentIdForDeviceEvent,
  IncidentsState,
  initialIncidentsState,
  pendingSync,
  reduce,
  VALID_TRANSITIONS,
} from '../emergency/incidentMachine';

const owner = { uid: 'elder1', name: 'Asha' };
const DEVICE = 'AA:BB:CC:DD:EE:FF';
const T0 = 1_700_000_000_000;

const ev = (eventType: DeviceEventType, eventId = 42, deviceState = DeviceState.FallAlarm): EventPacket => ({
  kind: 'event',
  eventId,
  eventType,
  deviceState,
  peakAccelG: 3.1,
  uptimeMs: 1000,
});

const deviceAction = (event: EventPacket, now = T0, simulated = false): Action => ({
  type: 'DEVICE_EVENT',
  now,
  owner,
  deviceId: DEVICE,
  simulated,
  event,
});

function run(actions: Action[], start: IncidentsState = initialIncidentsState) {
  let state = start;
  const effects: Effect[] = [];
  for (const a of actions) {
    const r = reduce(state, a, DEFAULT_CONFIG);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const types = (effects: Effect[]) => effects.map((e) => (e.type === 'device_command' ? `device_${e.command}` : e.type));

describe('normal fall flow', () => {
  it('possible fall -> confirmed countdown -> escalated -> acknowledged -> resolved', () => {
    let r = run([deviceAction(ev(DeviceEventType.PossibleFall, 42, DeviceState.PossibleFall))]);
    expect(r.state.active?.state).toBe('possible_fall');
    expect(types(r.effects)).toEqual(expect.arrayContaining(['device_ack', 'capture_location', 'notify', 'sync']));

    r = run([deviceAction(ev(DeviceEventType.FallConfirmed), T0 + 2000)], r.state);
    expect(r.state.active?.state).toBe('countdown');
    expect(r.state.active?.countdownEndsAt).toBe(T0 + 2000 + DEFAULT_CONFIG.countdownMs);

    r = run([{ type: 'TICK', now: T0 + 2000 + DEFAULT_CONFIG.countdownMs - 1 }], r.state);
    expect(r.state.active?.state).toBe('countdown');

    r = run([{ type: 'TICK', now: T0 + 2000 + DEFAULT_CONFIG.countdownMs }], r.state);
    expect(r.state.active?.state).toBe('escalated');
    expect(types(r.effects)).toContain('escalate');

    r = run([{ type: 'ACKNOWLEDGE', now: T0 + 40_000, uid: 'cg1', name: 'Ravi' }], r.state);
    expect(r.state.active?.state).toBe('acknowledged');
    expect(r.state.active?.acknowledgedBy).toEqual({ uid: 'cg1', name: 'Ravi' });

    r = run([{ type: 'RESOLVE', now: T0 + 60_000, by: 'cg1', resolution: 'assisted' }], r.state);
    expect(r.state.active).toBeNull();
    expect(r.state.history[0].state).toBe('resolved');
    expect(r.state.history[0].resolution).toBe('assisted');
    expect(types(r.effects)).toContain('device_resolve');
  });

  it('uses a stable incident id derived from owner, device and event id', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed, 9))]);
    expect(r.state.active?.id).toBe(incidentIdForDeviceEvent('elder1', DEVICE, 9));
    expect(r.state.active?.id).toBe('elder1_AA-BB-CC-DD-EE-FF_9');
  });

  it('starts the countdown when the watch never follows up a possible fall', () => {
    let r = run([deviceAction(ev(DeviceEventType.PossibleFall, 1, DeviceState.PossibleFall))]);
    r = run([{ type: 'TICK', now: T0 + DEFAULT_CONFIG.possibleFallTimeoutMs }], r.state);
    expect(r.state.active?.state).toBe('countdown');
  });
});

describe('cancellation', () => {
  it('cancel in the app during countdown closes the incident and tells the watch', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed)), { type: 'CANCEL', now: T0 + 5000, by: 'elder1' }]);
    expect(r.state.active).toBeNull();
    expect(r.state.history[0]).toMatchObject({ state: 'cancelled', cancelledBy: 'elder1' });
    expect(types(r.effects)).toContain('device_cancel');
    expect(types(r.effects)).not.toContain('escalate');
  });

  it('cancel on the watch closes the incident', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed)), deviceAction(ev(DeviceEventType.CancelledOnDevice, 42, DeviceState.Cancelled), T0 + 3000)]);
    expect(r.state.history[0]).toMatchObject({ state: 'cancelled', cancelledBy: 'wearer_on_watch' });
  });

  it('watch auto-clear cancels a possible fall', () => {
    const r = run([
      deviceAction(ev(DeviceEventType.PossibleFall, 5, DeviceState.PossibleFall)),
      deviceAction(ev(DeviceEventType.Cleared, 5, DeviceState.Normal), T0 + 1500),
    ]);
    expect(r.state.history[0]).toMatchObject({ state: 'cancelled', cancelledBy: 'watch_auto_cleared' });
  });

  it('cannot cancel after escalation: wearer OK is recorded but a person must resolve', () => {
    let r = run([deviceAction(ev(DeviceEventType.FallConfirmed)), { type: 'TICK', now: T0 + 31_000 }]);
    r = run([{ type: 'CANCEL', now: T0 + 32_000, by: 'elder1' }], r.state);
    expect(r.state.active?.state).toBe('escalated');
    r = run([deviceAction(ev(DeviceEventType.CancelledOnDevice, 42, DeviceState.Cancelled), T0 + 33_000)], r.state);
    expect(r.state.active?.state).toBe('escalated');
    expect(r.state.active?.timeline.some((t) => t.type === 'wearer_reported_ok')).toBe(true);
    r = run([{ type: 'RESOLVE', now: T0 + 34_000, by: 'elder1', resolution: 'false_alarm' }], r.state);
    expect(r.state.history[0].resolution).toBe('false_alarm');
  });
});

describe('duplicate protection', () => {
  it('ignores retransmitted BLE events but re-acknowledges them', () => {
    const first = run([deviceAction(ev(DeviceEventType.FallConfirmed))]);
    const dup = reduce(first.state, deviceAction(ev(DeviceEventType.FallConfirmed), T0 + 2000));
    expect(dup.duplicate).toBe(true);
    expect(dup.state).toBe(first.state);
    expect(types(dup.effects)).toEqual(['device_ack']);
  });

  it('a new fall while an incident is open is recorded on the open incident, not a second alert', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed, 1)), deviceAction(ev(DeviceEventType.FallConfirmed, 2), T0 + 1000)]);
    expect(r.state.active?.deviceEventId).toBe(1);
    expect(r.state.history).toHaveLength(0);
    expect(r.state.active?.timeline.some((t) => t.type === 'device_event_while_open')).toBe(true);
  });

  it('dedupe survives closing the incident (late retransmission does not reopen it)', () => {
    let r = run([deviceAction(ev(DeviceEventType.FallConfirmed, 3)), { type: 'CANCEL', now: T0 + 1000, by: 'elder1' }]);
    r = run([deviceAction(ev(DeviceEventType.FallConfirmed, 3), T0 + 5000)], r.state);
    expect(r.state.active).toBeNull();
  });

  it('caps the processed key list', () => {
    let state = initialIncidentsState;
    for (let i = 1; i <= 600; i++) {
      state = reduce(state, deviceAction(ev(DeviceEventType.Cleared, i, DeviceState.Normal))).state;
    }
    expect(state.processedEventKeys.length).toBe(500);
  });
});

describe('restart safety', () => {
  it('escalates an overdue countdown on the first tick after restart', () => {
    const before = run([deviceAction(ev(DeviceEventType.FallConfirmed))]).state;
    const rehydrated: IncidentsState = JSON.parse(JSON.stringify(before));
    const r = run([{ type: 'TICK', now: T0 + 10 * 60_000 }], rehydrated);
    expect(r.state.active?.state).toBe('escalated');
    expect(r.state.active?.timeline.at(-1)?.detail).toMatch(/not running/);
  });
});

describe('manual SOS', () => {
  it('creates an escalated incident immediately', () => {
    const r = run([{ type: 'MANUAL_SOS', now: T0, owner, id: 'sos1' }]);
    expect(r.state.active).toMatchObject({ id: 'sos1', state: 'escalated', source: 'manual_sos' });
    expect(types(r.effects)).toEqual(expect.arrayContaining(['escalate', 'capture_location', 'sync']));
  });

  it('escalates an open countdown instead of creating a second incident', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed)), { type: 'MANUAL_SOS', now: T0 + 1000, owner, id: 'sos2' }]);
    expect(r.state.active?.state).toBe('escalated');
    expect(r.state.active?.source).toBe('wearable');
  });

  it('watch SOS button escalates immediately', () => {
    const r = run([deviceAction(ev(DeviceEventType.SosButton, 77, DeviceState.SosAlarm))]);
    expect(r.state.active).toMatchObject({ state: 'escalated', source: 'wearable_sos' });
  });
});

describe('simulated incidents', () => {
  it('are flagged and never produce cloud sync effects', () => {
    const r = run([deviceAction(ev(DeviceEventType.FallConfirmed), T0, true), { type: 'TICK', now: T0 + 31_000 }]);
    expect(r.state.active?.simulated).toBe(true);
    expect(types(r.effects)).not.toContain('sync');
    expect(pendingSync(r.state)).toHaveLength(0);
  });
});

describe('location and sync bookkeeping', () => {
  it('stores unavailable location honestly rather than inventing coordinates', () => {
    let r = run([{ type: 'MANUAL_SOS', now: T0, owner, id: 'sos1' }]);
    r = run([{ type: 'LOCATION', incidentId: 'sos1', location: { status: 'permission_denied', checkedAt: T0 + 10 } }], r.state);
    expect(r.state.active?.location).toEqual({ status: 'permission_denied', checkedAt: T0 + 10 });
  });

  it('tracks pending sync by version', () => {
    let r = run([{ type: 'MANUAL_SOS', now: T0, owner, id: 'sos1' }]);
    expect(pendingSync(r.state)).toHaveLength(1);
    r = run([{ type: 'SYNCED', incidentId: 'sos1', version: r.state.active!.version }], r.state);
    expect(pendingSync(r.state)).toHaveLength(0);
    r = run([{ type: 'ACKNOWLEDGE', now: T0 + 1, uid: 'cg', name: 'C' }], r.state);
    expect(pendingSync(r.state)).toHaveLength(1);
  });

  it('adopts a caregiver acknowledgement from the cloud without echoing it back', () => {
    let r = run([{ type: 'MANUAL_SOS', now: T0, owner, id: 'sos1' }]);
    r = run([{ type: 'SYNCED', incidentId: 'sos1', version: r.state.active!.version }], r.state);
    r = run([{ type: 'REMOTE_UPDATE', now: T0 + 5, incidentId: 'sos1', remote: { state: 'acknowledged', acknowledgedBy: { uid: 'cg', name: 'Ravi' }, acknowledgedAt: T0 + 4 } }], r.state);
    expect(r.state.active?.state).toBe('acknowledged');
    expect(pendingSync(r.state)).toHaveLength(0);
  });

  it('never lets a remote update move an incident backwards', () => {
    let r = run([{ type: 'MANUAL_SOS', now: T0, owner, id: 'sos1' }, { type: 'ACKNOWLEDGE', now: T0 + 1, uid: 'cg', name: 'C' }]);
    r = run([{ type: 'REMOTE_UPDATE', now: T0 + 5, incidentId: 'sos1', remote: { state: 'escalated' } }], r.state);
    expect(r.state.active?.state).toBe('acknowledged');
  });
});

describe('transition table', () => {
  it('closed states are terminal and every target is a known state', () => {
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
    expect(VALID_TRANSITIONS.resolved).toEqual([]);
    expect(canTransition('countdown', 'resolved')).toBe(false);
    expect(canTransition('escalated', 'cancelled')).toBe(false);
    expect(canTransition('escalated', 'resolved')).toBe(true);
  });
});
