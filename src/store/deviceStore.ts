import { create } from 'zustand';
import { Device, DeviceTelemetry } from '../types';
import * as SecureStore from 'expo-secure-store';

interface DeviceState {
  pairedDevice: Device | null;
  scannedDevices: Device[];
  isScanning: boolean;
  isConnected: boolean;
  isSimulatorMode: boolean;
  telemetry: DeviceTelemetry | null;
  rssiHistory: number[];
  
  setPairedDevice: (device: Device | null) => void;
  setScannedDevices: (devices: Device[]) => void;
  setScanning: (scanning: boolean) => void;
  setConnected: (connected: boolean) => void;
  setSimulatorMode: (enabled: boolean) => void;
  updateTelemetry: (telemetry: DeviceTelemetry | null) => void;
  addRssiReading: (rssi: number) => void;
  initializeDevice: () => Promise<void>;
  pairDevice: (device: Device) => Promise<void>;
  unpairDevice: () => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  pairedDevice: null,
  scannedDevices: [],
  isScanning: false,
  isConnected: false,
  isSimulatorMode: true, // Default to true for ease of previewing/testing
  telemetry: {
    accelX: 0.0,
    accelY: 9.8, // Gravity standard on Y
    accelZ: 0.1,
    gyroX: 0.0,
    gyroY: 0.0,
    gyroZ: 0.0,
    fallScore: 12,
  },
  rssiHistory: [-72, -74, -71, -75],

  setPairedDevice: (device) => set({ pairedDevice: device }),
  setScannedDevices: (scannedDevices) => set({ scannedDevices }),
  setScanning: (isScanning) => set({ isScanning }),
  setConnected: (isConnected) => set({ isConnected }),
  setSimulatorMode: (isSimulatorMode) => set({ isSimulatorMode }),
  updateTelemetry: (telemetry) => set({ telemetry }),
  
  addRssiReading: (rssi) => set((state) => {
    const updatedHistory = [...state.rssiHistory.slice(-10), rssi];
    return { 
      rssiHistory: updatedHistory,
      pairedDevice: state.pairedDevice 
        ? { ...state.pairedDevice, rssi } 
        : null 
    };
  }),

  initializeDevice: async () => {
    try {
      const storedDevice = await SecureStore.getItemAsync('paired_device');
      if (storedDevice) {
        const deviceObj = JSON.parse(storedDevice) as Device;
        set({ 
          pairedDevice: deviceObj, 
          isConnected: deviceObj.status === 'connected' 
        });
      }
    } catch (err) {
      console.error('Failed to load device config', err);
    }
  },

  pairDevice: async (device) => {
    try {
      const paired: Device = {
        ...device,
        status: 'connected',
        lastSync: new Date().toISOString()
      };
      await SecureStore.setItemAsync('paired_device', JSON.stringify(paired));
      set({ pairedDevice: paired, isConnected: true });
    } catch (err) {
      console.error('Failed to save device pairing', err);
    }
  },

  unpairDevice: async () => {
    try {
      await SecureStore.deleteItemAsync('paired_device');
      set({ pairedDevice: null, isConnected: false, telemetry: null });
    } catch (err) {
      console.error('Failed to delete device pairing', err);
    }
  }
}));
