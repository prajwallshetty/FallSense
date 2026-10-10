import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventType, DeviceState } from '../ble/protocol';
import { initialIncidentsState } from '../emergency/incidentMachine';
import { setEffectHandler, useIncidentStore } from '../store/incidentStore';

const owner = { uid: 'elder1', name: 'Asha' };
const fallEvent = (eventType = DeviceEventType.FallConfirmed) => ({
  type: 'DEVICE_EVENT' as const,
  now: Date.now(),
  owner,
  deviceId: 'dev',
  simulated: false,
  event: { kind: 'event' as const, eventId: 11, eventType, deviceState: DeviceState.FallAlarm, peakAccelG: 3, uptimeMs: 1 },
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  setEffectHandler(() => undefined);
  useIncidentStore.getState().reset();
  await flush();
  await AsyncStorage.clear();
});

describe('incident persistence', () => {
  it('persists an active incident and restores it after an app restart', async () => {
    useIncidentStore.getState().dispatch(fallEvent());
    await flush();
    const raw = await AsyncStorage.getItem('safefall.incidents.v1');
    expect(raw).toContain('"state":"countdown"');

    // Simulate a cold start: in-memory state is gone, storage remains. (setState also
    // persists, so the saved copy is put back before rehydrating.)
    useIncidentStore.setState({ ...initialIncidentsState, hydrated: false });
    expect(useIncidentStore.getState().active).toBeNull();
    await AsyncStorage.setItem('safefall.incidents.v1', raw!);
    await useIncidentStore.persist.rehydrate();

    const state = useIncidentStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.active?.state).toBe('countdown');
    expect(state.processedEventKeys).toContain('dev:11:2');
    // The dedupe list survived too: a retransmission after restart is ignored.
    expect(state.dispatch(fallEvent()).duplicate).toBe(true);
  });

  it('queues side effects until a handler is registered, then delivers them', () => {
    setEffectHandler(null);
    useIncidentStore.getState().dispatch(fallEvent());
    const handler = jest.fn();
    setEffectHandler(handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const effects = handler.mock.calls[0][0].map((e: { type: string }) => e.type);
    expect(effects).toEqual(expect.arrayContaining(['device_command', 'capture_location', 'sync']));
  });

  it('reset clears incidents and the stored copy (used on sign-out)', async () => {
    useIncidentStore.getState().dispatch(fallEvent());
    useIncidentStore.getState().reset();
    await flush();
    expect(useIncidentStore.getState().active).toBeNull();
    expect(useIncidentStore.getState().processedEventKeys).toEqual([]);
    expect(await AsyncStorage.getItem('safefall.incidents.v1')).not.toContain('countdown');
  });
});
