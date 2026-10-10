// Watch connection state. Only the pairing (which watch to reconnect to) is persisted; live
// connection state always starts as disconnected so the UI never shows a stale "connected".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LinkStatus } from '../ble/connectionManager';
import type { DeviceState, TelemetryPacket } from '../ble/protocol';
import type { ScannedPeripheral } from '../ble/transport';

export interface PairedDevice {
  deviceId: string;
  name: string;
  pairedAt: number;
  /** True only for the developer simulator. */
  isSimulated: boolean;
}

export interface LiveTelemetry {
  accel: TelemetryPacket['accel'];
  gyro: TelemetryPacket['gyro'];
  magnitudeG: number;
  receivedAt: number;
}

interface DeviceStore {
  paired: PairedDevice | null;

  linkStatus: LinkStatus;
  linkError: string | null;
  nextRetryAt: number | null;
  firmwareVersion: string | null;
  hasTelemetry: boolean;
  batteryPercent: number | null;
  batteryMillivolts: number | null;
  charging: boolean;
  imuOk: boolean | null;
  deviceState: DeviceState | null;
  lastPacketAt: number | null;
  isStale: boolean;
  telemetry: LiveTelemetry | null;
  protocolErrors: number;
  lastProtocolError: string | null;

  scanning: boolean;
  scanResults: ScannedPeripheral[];
  scanError: string | null;

  setPaired: (p: PairedDevice | null) => void;
  patch: (p: Partial<Omit<DeviceStore, 'setPaired' | 'patch' | 'resetLive' | 'addScanResult'>>) => void;
  addScanResult: (p: ScannedPeripheral) => void;
  resetLive: () => void;
}

const LIVE_DEFAULTS = {
  linkStatus: 'idle' as LinkStatus,
  linkError: null,
  nextRetryAt: null,
  firmwareVersion: null,
  hasTelemetry: false,
  batteryPercent: null,
  batteryMillivolts: null,
  charging: false,
  imuOk: null,
  deviceState: null,
  lastPacketAt: null,
  isStale: false,
  telemetry: null,
  protocolErrors: 0,
  lastProtocolError: null,
};

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      paired: null,
      ...LIVE_DEFAULTS,
      scanning: false,
      scanResults: [],
      scanError: null,

      setPaired: (paired) => set({ paired }),
      patch: (p) => set(p),
      addScanResult: (p) =>
        set((s) => {
          const existing = s.scanResults.findIndex((r) => r.id === p.id);
          const list = [...s.scanResults];
          if (existing >= 0) list[existing] = p;
          else list.push(p);
          // SafeFall watches first, then strongest signal.
          list.sort((a, b) => Number(b.looksLikeSafeFall) - Number(a.looksLikeSafeFall) || (b.rssi ?? -999) - (a.rssi ?? -999));
          return { scanResults: list };
        }),
      resetLive: () => set({ ...LIVE_DEFAULTS }),
    }),
    {
      name: 'safefall.device.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ paired: s.paired }),
    },
  ),
);

export const isLinkUp = (s: LinkStatus) => s === 'connected';
