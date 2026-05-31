// BLE Service Interface & Simulator
// In standard React Native, this wraps 'react-native-ble-plx'.
// A rich Simulator Mode is built-in to let the app function seamlessly in Expo Go/Simulators.

import { Device, DeviceTelemetry } from '../types';
import { useDeviceStore } from '../store/deviceStore';
import { useAlertStore } from '../store/alertStore';
import { useAuthStore } from '../store/authStore';

// ESP32 Fall Service UUID definitions
const FALL_SERVICE_UUID = '4FA10001-C4C2-4C2E-9D19-9B92A265E923';
const TELEMETRY_CHAR_UUID = '4FA10002-C4C2-4C2E-9D19-9B92A265E923';

class BLEService {
  private simInterval: any = null;
  private rssiInterval: any = null;

  async startScan(onDeviceFound: (device: Device) => void): Promise<void> {
    const { isSimulatorMode } = useDeviceStore.getState();
    
    if (isSimulatorMode) {
      // Simulate discovering our ESP32-based Smartwatch
      console.log('BLE SCAN: Starting simulator scan...');
      await this.delay(800);
      onDeviceFound({
        deviceId: 'dev_safefall_esp32',
        userId: '',
        macAddress: '24:0A:C4:8B:58:A2',
        name: 'SafeFall Smartwatch v1',
        firmwareVersion: '1.2.4-stable',
        batteryLevel: 94,
        status: 'disconnected',
        lastSync: new Date().toISOString(),
        rssi: -65
      });
      
      await this.delay(1000);
      onDeviceFound({
        deviceId: 'dev_generic_fit',
        userId: '',
        macAddress: 'AA:BB:CC:11:22:33',
        name: 'Generic Fitness Band',
        firmwareVersion: '1.0.0',
        batteryLevel: 42,
        status: 'disconnected',
        lastSync: new Date().toISOString(),
        rssi: -85
      });
    } else {
      console.warn('BLE SCAN: Real BLE scanning requires custom dev builds. Defaulting to simulator mode.');
    }
  }

  async stopScan(): Promise<void> {
    console.log('BLE SCAN: Stopping scans.');
  }

  async connect(device: Device): Promise<void> {
    const deviceStore = useDeviceStore.getState();
    console.log(`BLE CONNECT: Attempting connection to ${device.name} [${device.deviceId}]`);
    
    await this.delay(1200); // Simulate connection handshake latency
    
    deviceStore.pairDevice(device);
    this.startTelemetrySimulation();
    this.startRssiTelemetry();
  }

  async disconnect(): Promise<void> {
    const deviceStore = useDeviceStore.getState();
    console.log('BLE DISCONNECT: Tearing down Bluetooth connections.');
    
    this.stopTelemetrySimulation();
    this.stopRssiTelemetry();
    await deviceStore.unpairDevice();
  }

  // --- Telemetry & Fall Simulator ---

  private startTelemetrySimulation() {
    this.stopTelemetrySimulation();
    console.log('SIMULATOR: Starting real-time sensor updates...');
    
    let stepAccumulator = 2200;
    
    this.simInterval = setInterval(() => {
      const deviceStore = useDeviceStore.getState();
      if (!deviceStore.pairedDevice || !deviceStore.isConnected) {
        this.stopTelemetrySimulation();
        return;
      }

      // 1. Generate slight sensor noise for Accel & Gyro
      const noise = () => (Math.random() - 0.5) * 0.1;
      const gyroNoise = () => (Math.random() - 0.5) * 1.5;
      
      const newTelemetry: DeviceTelemetry = {
        accelX: 0.0 + noise(),
        accelY: 9.8 + noise(), // Y is vertical gravity
        accelZ: 0.1 + noise(),
        gyroX: 0.0 + gyroNoise(),
        gyroY: 0.0 + gyroNoise(),
        gyroZ: 0.0 + gyroNoise(),
        fallScore: Math.floor(8 + Math.random() * 8) // default safe fall score
      };

      deviceStore.updateTelemetry(newTelemetry);

      // 2. Slow battery drain simulation
      const currentBattery = deviceStore.pairedDevice.batteryLevel;
      if (Math.random() > 0.98 && currentBattery > 5) {
        deviceStore.setPairedDevice({
          ...deviceStore.pairedDevice,
          batteryLevel: currentBattery - 1
        });
      }

      // 3. Periodic step accumulator increases (simulating steps in real time)
      if (Math.random() > 0.7) {
        stepAccumulator += Math.floor(Math.random() * 3) + 1;
        const currentUser = useAuthStore.getState().user;
        // In real app, we sync step telemetry to database
        if (currentUser) {
          // Send local step count update
        }
      }

    }, 2000);
  }

  private stopTelemetrySimulation() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  private startRssiTelemetry() {
    this.stopRssiTelemetry();
    this.rssiInterval = setInterval(() => {
      const deviceStore = useDeviceStore.getState();
      if (!deviceStore.pairedDevice || !deviceStore.isConnected) {
        this.stopRssiTelemetry();
        return;
      }
      // Generate randomized RSSI signal fluctuations
      const baseRssi = -70;
      const variation = Math.floor(Math.random() * 10) - 5;
      deviceStore.addRssiReading(baseRssi + variation);
    }, 4000);
  }

  private stopRssiTelemetry() {
    if (this.rssiInterval) {
      clearInterval(this.rssiInterval);
      this.rssiInterval = null;
    }
  }

  // --- Force Trigger Fall for Testing ---
  
  simulateFallEvent() {
    const deviceStore = useDeviceStore.getState();
    const alertStore = useAlertStore.getState();
    const authStore = useAuthStore.getState();

    if (!deviceStore.isConnected) {
      console.warn('SIMULATOR: Connect a smartwatch first before simulating a fall!');
      return;
    }

    console.log('SIMULATOR: !!! TRIGGERING HIGH ACCELERATION SPIKE (FALL DETECTED) !!!');

    // 1. Send fall spike telemetry
    const fallTelemetry: DeviceTelemetry = {
      accelX: 3.5,
      accelY: -18.2, // Sudden reverse gravity vector
      accelZ: -8.4,
      gyroX: 180.5,
      gyroY: -90.2,
      gyroZ: 45.1,
      fallScore: 98 // High confidence threshold!
    };
    deviceStore.updateTelemetry(fallTelemetry);

    // 2. Trigger Global Alert countdown
    const patientName = authStore.user?.role === 'elderly' 
      ? authStore.user.fullName 
      : (authStore.activeElderlyProfile?.fullName || 'Margaret Thompson');
      
    const patientId = authStore.user?.role === 'elderly'
      ? authStore.user.userId
      : (authStore.activeElderlyProfile?.userId || 'elderly_1');

    alertStore.triggerFall({
      userId: patientId,
      userName: patientName,
      timestamp: new Date().toISOString(),
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: '123 Pine St, San Francisco, CA'
      }
    });
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const bleService = new BLEService();
