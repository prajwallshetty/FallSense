// Real BLE transport backed by react-native-ble-plx.
// Requires a development or release build (the native module is not part of Expo Go).

import type { BleManager as PlxManager, Device as PlxDevice } from 'react-native-ble-plx';
import { DEVICE_NAME_PREFIX, SAFEFALL_SERVICE_UUID } from './protocol';
import {
  AdapterState,
  BleSubscription,
  BleTransport,
  BleUnavailableError,
  GattTable,
  ScannedPeripheral,
  withTimeout,
} from './transport';

const STATE_MAP: Record<string, AdapterState> = {
  Unknown: 'unknown',
  Resetting: 'resetting',
  Unsupported: 'unsupported',
  Unauthorized: 'unauthorized',
  PoweredOff: 'powered_off',
  PoweredOn: 'powered_on',
};

function describeError(e: unknown): Error {
  if (e instanceof Error) {
    // BleError carries a numeric errorCode and a native `reason`.
    const anyErr = e as Error & { reason?: string | null; errorCode?: number };
    const reason = anyErr.reason ? ` (${anyErr.reason})` : '';
    const err = new Error(`${e.message}${reason}`);
    (err as Error & { code?: number }).code = anyErr.errorCode;
    return err;
  }
  return new Error(String(e));
}

export class PlxTransport implements BleTransport {
  readonly isSimulated = false;
  private manager: PlxManager;

  constructor() {
    let mod: typeof import('react-native-ble-plx');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('react-native-ble-plx');
      this.manager = new mod.BleManager();
    } catch {
      throw new BleUnavailableError(
        'Bluetooth is not available in this build. Expo Go does not include the BLE module: ' +
          'install a development build (npx expo run:android) or a release APK.',
      );
    }
  }

  async getState(): Promise<AdapterState> {
    return STATE_MAP[await this.manager.state()] ?? 'unknown';
  }

  onStateChange(cb: (state: AdapterState) => void): BleSubscription {
    return this.manager.onStateChange((s) => cb(STATE_MAP[s] ?? 'unknown'), true);
  }

  startScan(onDevice: (p: ScannedPeripheral) => void, onError: (e: Error) => void): void {
    // Scan without a UUID filter: some firmware builds put the 128-bit UUID in the scan
    // response rather than the advertisement, which Android filters can miss. We classify
    // results ourselves instead.
    this.manager
      .startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          onError(describeError(error));
          return;
        }
        if (!device) return;
        const name = device.localName ?? device.name ?? null;
        const uuids = (device.serviceUUIDs ?? []).map((u) => u.toLowerCase());
        onDevice({
          id: device.id,
          name,
          rssi: device.rssi ?? null,
          looksLikeSafeFall: uuids.includes(SAFEFALL_SERVICE_UUID) || !!name?.startsWith(DEVICE_NAME_PREFIX),
        });
      })
      .catch((e) => onError(describeError(e)));
  }

  stopScan(): void {
    this.manager.stopDeviceScan().catch(() => undefined);
  }

  async connect(id: string, timeoutMs: number): Promise<{ name: string | null }> {
    try {
      const device: PlxDevice = await withTimeout(
        this.manager.connectToDevice(id, { autoConnect: false, timeout: timeoutMs }),
        timeoutMs + 1000,
        () => {
          this.manager.cancelDeviceConnection(id).catch(() => undefined);
        },
      );
      return { name: device.localName ?? device.name ?? null };
    } catch (e) {
      throw describeError(e);
    }
  }

  async discover(id: string): Promise<GattTable> {
    try {
      const device = await this.manager.discoverAllServicesAndCharacteristicsForDevice(id);
      const table: GattTable = {};
      for (const service of await device.services()) {
        const chars = await service.characteristics();
        table[service.uuid.toLowerCase()] = chars.map((c) => c.uuid.toLowerCase());
      }
      return table;
    } catch (e) {
      throw describeError(e);
    }
  }

  async requestMtu(id: string, mtu: number): Promise<void> {
    await this.manager.requestMTUForDevice(id, mtu);
  }

  monitor(
    id: string,
    service: string,
    characteristic: string,
    cb: (error: Error | null, base64Value: string | null) => void,
  ): BleSubscription {
    return this.manager.monitorCharacteristicForDevice(id, service, characteristic, (error, c) => {
      if (error) cb(describeError(error), null);
      else cb(null, c?.value ?? null);
    });
  }

  async read(id: string, service: string, characteristic: string): Promise<string | null> {
    try {
      const c = await this.manager.readCharacteristicForDevice(id, service, characteristic);
      return c.value ?? null;
    } catch (e) {
      throw describeError(e);
    }
  }

  async write(id: string, service: string, characteristic: string, base64Value: string): Promise<void> {
    try {
      await this.manager.writeCharacteristicWithResponseForDevice(id, service, characteristic, base64Value);
    } catch (e) {
      throw describeError(e);
    }
  }

  async disconnect(id: string): Promise<void> {
    try {
      await this.manager.cancelDeviceConnection(id);
    } catch {
      // Already disconnected.
    }
  }

  onDisconnected(id: string, cb: (error: Error | null) => void): BleSubscription {
    return this.manager.onDeviceDisconnected(id, (error) => cb(error ? describeError(error) : null));
  }

  async readRssi(id: string): Promise<number | null> {
    try {
      const d = await this.manager.readRSSIForDevice(id);
      return d.rssi ?? null;
    } catch {
      return null;
    }
  }
}
