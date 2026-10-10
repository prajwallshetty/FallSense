// Minimal BLE transport abstraction used by the connection manager.
// Implementations: PlxTransport (real radio, react-native-ble-plx) and SimulatedTransport
// (developer tool). Keeping the surface small makes reconnect/stale logic unit-testable.

export type AdapterState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'powered_off'
  | 'powered_on';

export interface ScannedPeripheral {
  id: string;
  name: string | null;
  rssi: number | null;
  /** True when advertising the SafeFall service UUID (or name prefix when UUIDs are not advertised). */
  looksLikeSafeFall: boolean;
}

export interface BleSubscription {
  remove(): void;
}

/** Map of lower-case service UUID -> lower-case characteristic UUIDs. */
export type GattTable = Record<string, string[]>;

export interface BleTransport {
  readonly isSimulated: boolean;
  getState(): Promise<AdapterState>;
  onStateChange(cb: (state: AdapterState) => void): BleSubscription;
  startScan(onDevice: (p: ScannedPeripheral) => void, onError: (e: Error) => void): void;
  stopScan(): void;
  connect(id: string, timeoutMs: number): Promise<{ name: string | null }>;
  discover(id: string): Promise<GattTable>;
  requestMtu(id: string, mtu: number): Promise<void>;
  monitor(
    id: string,
    service: string,
    characteristic: string,
    cb: (error: Error | null, base64Value: string | null) => void,
  ): BleSubscription;
  read(id: string, service: string, characteristic: string): Promise<string | null>;
  write(id: string, service: string, characteristic: string, base64Value: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  onDisconnected(id: string, cb: (error: Error | null) => void): BleSubscription;
  readRssi(id: string): Promise<number | null>;
}

export class BleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BleUnavailableError';
  }
}

export class ConnectTimeoutError extends Error {
  constructor(ms: number) {
    super(`The watch did not respond within ${Math.round(ms / 1000)} seconds.`);
    this.name = 'ConnectTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ConnectTimeoutError(ms));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
