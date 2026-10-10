/* eslint-disable @typescript-eslint/no-require-imports -- modules are re-required after jest.resetModules() */
// The developer simulator must never masquerade as a physical watch.
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../services/firebase', () => ({ firebaseService: { upsertDeviceStatus: jest.fn(() => Promise.resolve()) } }));
jest.mock('../services/firebaseApp', () => ({ describeFirebaseError: (e: unknown) => String(e) }));
jest.mock('react-native-ble-plx', () => {
  throw new Error('native module missing');
});

function loadWith(devToolsEnabled: boolean) {
  jest.resetModules();
  jest.doMock('../config/env', () => ({
    env: { devToolsEnabled, fallCountdownSeconds: 30, isFirebaseConfigured: true, defaultCountryCode: '', emergencyServicesNumber: '' },
  }));
  const { bleService } = require('../services/bleService');
  const { useDeviceStore } = require('../store/deviceStore');
  const { useAuthStore } = require('../store/authStore');
  const { firebaseService } = require('../services/firebase');
  return { bleService, useDeviceStore, useAuthStore, firebaseService };
}

beforeEach(() => AsyncStorage.clear());

describe('simulator safety', () => {
  it('is not available unless dev tools are explicitly enabled', () => {
    const { bleService } = loadWith(false);
    expect(bleService.simulatorEnabled).toBe(false);
    expect(bleService.simulator).toBeNull();
  });

  it('drops a persisted simulator pairing in a build without dev tools', async () => {
    const { bleService, useDeviceStore } = loadWith(false);
    useDeviceStore.getState().setPaired({ deviceId: 'SIMULATED-WATCH', name: 'SafeFall Simulator', pairedAt: 1, isSimulated: true });
    await bleService.resume();
    expect(useDeviceStore.getState().paired).toBeNull();
    expect(useDeviceStore.getState().linkStatus).not.toBe('connected');
  });

  it('reports why real Bluetooth is unavailable instead of falling back to the simulator', () => {
    const { bleService } = loadWith(false);
    expect(bleService.unavailableReason).toMatch(/development build/);
  });

  it('flags the simulated watch, its incidents, and never uploads it as a caregiver-visible device', async () => {
    jest.useFakeTimers();
    const { bleService, useDeviceStore, useAuthStore, firebaseService } = loadWith(true);
    useAuthStore.setState({ profile: { userId: 'u1', role: 'elderly', fullName: 'Asha', email: '', phone: '', onboardingComplete: true, createdAt: 0 } });
    const { useIncidentStore } = require('../store/incidentStore');

    const pairing = bleService.pair({ id: 'SIMULATED-WATCH', name: 'SafeFall Simulator', rssi: null, looksLikeSafeFall: true });
    await jest.advanceTimersByTimeAsync(1000);
    await pairing;
    expect(useDeviceStore.getState().paired).toMatchObject({ isSimulated: true });
    expect(useDeviceStore.getState().linkStatus).toBe('connected');

    bleService.simulator.simulateFall();
    await jest.advanceTimersByTimeAsync(2500);
    const active = useIncidentStore.getState().active;
    expect(active).toMatchObject({ simulated: true, state: 'countdown' });

    // Retransmissions every 2 s would be acknowledged; no duplicate incidents appear.
    await jest.advanceTimersByTimeAsync(6000);
    expect(useIncidentStore.getState().history).toHaveLength(0);
    expect(firebaseService.upsertDeviceStatus).not.toHaveBeenCalled();

    await bleService.stop();
    jest.useRealTimers();
  });
});
