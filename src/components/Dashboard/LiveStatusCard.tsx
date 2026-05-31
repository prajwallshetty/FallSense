import React from 'react';
import { View, Text } from 'react-native';
import { useDeviceStore } from '../../store/deviceStore';
import { StatusBadge } from '../ui/StatusBadge';
import { Card } from '../ui/Card';
import { Cpu, Wifi, RefreshCw } from 'lucide-react-native';

export const LiveStatusCard: React.FC = () => {
  const { pairedDevice, isConnected, telemetry, rssiHistory } = useDeviceStore();

  const currentRssi = pairedDevice?.rssi || -70;
  
  // Calculate signal quality string
  const getSignalStrength = (rssi: number) => {
    if (rssi > -60) return 'Excellent';
    if (rssi > -75) return 'Good';
    if (rssi > -85) return 'Fair';
    return 'Weak';
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -60) return 'text-emerald-500';
    if (rssi > -75) return 'text-teal-500';
    if (rssi > -85) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Card className="mb-4">
      {/* Header Info */}
      <View className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
        <View className="flex-row items-center">
          <View className="p-2.5 bg-teal-50 dark:bg-teal-950/30 rounded-xl mr-3">
            <Cpu size={24} className="text-teal-600 dark:text-teal-400" />
          </View>
          <View>
            <Text className="text-base font-bold text-slate-800 dark:text-white">
              {pairedDevice ? pairedDevice.name : 'No Smartwatch Paired'}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {pairedDevice ? `FW: v${pairedDevice.firmwareVersion}` : 'Go to Device Scan to connect'}
            </Text>
          </View>
        </View>
        <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
      </View>

      {/* Connection Vitals */}
      {pairedDevice ? (
        <View className="grid grid-cols-2 gap-3 flex-row flex-wrap justify-between">
          {/* Signal Strength */}
          <View className="w-[48%] bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium">Signal Strength</Text>
              <Wifi size={16} className={getSignalColor(currentRssi)} />
            </View>
            <Text className="text-base font-bold text-slate-800 dark:text-white">
              {currentRssi} dBm
            </Text>
            <Text className="text-xxs text-slate-400 dark:text-slate-500 uppercase font-semibold">
              {getSignalStrength(currentRssi)} Link
            </Text>
          </View>

          {/* Sync status */}
          <View className="w-[48%] bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium">Fall Protection</Text>
              <RefreshCw size={16} className={isConnected ? 'text-teal-500 animate-spin' : 'text-slate-400'} />
            </View>
            <Text className="text-base font-bold text-slate-800 dark:text-white">
              {isConnected ? 'Active & Live' : 'Offline'}
            </Text>
            <Text className="text-xxs text-slate-400 dark:text-slate-500 uppercase font-semibold">
              {isConnected ? 'Continuous Sync' : 'Reconnecting...'}
            </Text>
          </View>
        </View>
      ) : (
        <View className="items-center py-4">
          <Text className="text-sm text-slate-400 dark:text-slate-500 text-center">
            Pair your smartwatch via BLE in the Devices tab to enable continuous fall-detection and telemetry sync.
          </Text>
        </View>
      )}

      {/* Telemetry Vectors (G-Force & Angular Velocity) */}
      {isConnected && telemetry && (
        <View className="mt-4 bg-slate-900/5 dark:bg-slate-950/70 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
          <Text className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
            Sensor Telemetry (MPU6050 Live)
          </Text>
          
          <View className="flex-row justify-between mb-3">
            <View>
              <Text className="text-xxs font-bold text-slate-400 uppercase">Accel (G-Force)</Text>
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                X: {telemetry.accelX.toFixed(2)} | Y: {telemetry.accelY.toFixed(2)} | Z: {telemetry.accelZ.toFixed(2)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xxs font-bold text-slate-400 uppercase">Gyro (deg/s)</Text>
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                X: {telemetry.gyroX.toFixed(0)}° | Y: {telemetry.gyroY.toFixed(0)}° | Z: {telemetry.gyroZ.toFixed(0)}°
              </Text>
            </View>
          </View>

          {/* Fall score confidence bar */}
          <View>
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xxs font-bold text-slate-400 uppercase">Fall Confidence Index</Text>
              <Text className={`text-xs font-bold ${telemetry.fallScore > 70 ? 'text-red-500' : 'text-teal-500'}`}>
                {telemetry.fallScore}%
              </Text>
            </View>
            <View className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <View 
                className={`h-full rounded-full ${telemetry.fallScore > 70 ? 'bg-red-500' : 'bg-teal-500'}`}
                style={{ width: `${telemetry.fallScore}%` }}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
};
