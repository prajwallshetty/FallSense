import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Switch, Platform } from 'react-native';
import { useDeviceStore } from '../../../store/deviceStore';
import { bleService } from '../../../services/bleService';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Device } from '../../../types';
import { Cpu, Bluetooth, RefreshCw, Smartphone, ShieldCheck, XCircle } from 'lucide-react-native';

export default function DevicesScreen() {
  const { 
    pairedDevice, 
    isConnected, 
    scannedDevices, 
    isScanning, 
    isSimulatorMode, 
    setScanning, 
    setScannedDevices, 
    setSimulatorMode 
  } = useDeviceStore();

  const [scanTriggered, setScanTriggered] = useState(false);

  const startDiscovery = async () => {
    setScannedDevices([]);
    setScanning(true);
    setScanTriggered(true);

    try {
      await bleService.startScan((device) => {
        const currentList = useDeviceStore.getState().scannedDevices;
        if (!currentList.some(d => d.deviceId === device.deviceId)) {
          setScannedDevices([...currentList, device]);
        }
      });

      // Automatically terminate scan after 6 seconds to save device radio power
      setTimeout(async () => {
        await bleService.stopScan();
        setScanning(false);
      }, 6000);
    } catch (err) {
      Alert.alert('Scan Failed', (err as Error).message);
      setScanning(false);
    }
  };

  const handleConnectDevice = async (device: Device) => {
    await bleService.stopScan();
    setScanning(false);
    
    try {
      await bleService.connect(device);
      Alert.alert('Connection Successful', `${device.name} is now monitoring falls.`);
    } catch (err) {
      Alert.alert('Connection Error', `Failed to pair with ${device.name}: ${(err as Error).message}`);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Device',
      'Are you sure you want to disconnect from your SafeFall Smartwatch?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Disconnect', 
          style: 'destructive',
          onPress: async () => {
            await bleService.disconnect();
          } 
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Header */}
      <View className="mb-6">
        <Text className="text-xxs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Hardware Interface
        </Text>
        <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">
          Smartwatch Manager
        </Text>
      </View>

      {/* Connection State Card */}
      {pairedDevice ? (
        <Card className="mb-4">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="p-3 bg-teal-500/10 rounded-2xl mr-3">
                <Cpu size={24} className="text-teal-600 dark:text-teal-400" />
              </View>
              <View>
                <Text className="text-base font-bold text-slate-800 dark:text-white">{pairedDevice.name}</Text>
                <Text className="text-xxs text-slate-400 font-bold uppercase">{pairedDevice.macAddress}</Text>
              </View>
            </View>
            <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
          </View>

          <View className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-2 mb-4">
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-slate-500 dark:text-slate-400">Firmware Build</Text>
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">v{pairedDevice.firmwareVersion}</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-slate-500 dark:text-slate-400">Battery Level</Text>
              <Text className={`text-xs font-bold ${pairedDevice.batteryLevel < 20 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
                {pairedDevice.batteryLevel}%
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-slate-500 dark:text-slate-400">BLE Status</Text>
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">Monitoring Active</Text>
            </View>
          </View>

          <Button
            title="Disconnect Watch"
            onPress={handleDisconnect}
            variant="outline"
            size="md"
            className="w-full border-red-500/30 text-red-500"
          />
        </Card>
      ) : (
        <Card className="mb-4 items-center py-8">
          <Bluetooth size={44} className="text-slate-300 dark:text-slate-600 mb-3" />
          <Text className="text-base font-bold text-slate-800 dark:text-white mb-1">No Wearable Paired</Text>
          <Text className="text-xs text-slate-400 dark:text-slate-500 text-center px-6 leading-4.5 mb-6">
            Scan and connect to the SafeFall Smartwatch to activate automatic fall monitoring and vitals telemetry.
          </Text>
          <Button
            title="Start Bluetooth Scan"
            onPress={startDiscovery}
            variant="primary"
            size="lg"
            className="w-full px-6"
          />
        </Card>
      )}

      {/* Bluetooth scan results list */}
      {scanTriggered && (
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-sm font-bold text-slate-800 dark:text-white">Nearby BLE Peripherals</Text>
            {isScanning && <ActivityIndicator size="small" color="#0D9488" />}
          </View>

          {scannedDevices.length > 0 ? (
            scannedDevices.map((dev) => (
              <Card key={dev.deviceId} className="mb-3 flex-row items-center justify-between border-slate-100 dark:border-slate-800/80 p-4">
                <View className="flex-row items-center">
                  <Smartphone size={20} className="text-slate-400 mr-3" />
                  <View>
                    <Text className="text-sm font-bold text-slate-800 dark:text-white">{dev.name}</Text>
                    <Text className="text-xxs text-slate-400 dark:text-slate-500 font-bold uppercase">{dev.macAddress}</Text>
                  </View>
                </View>
                <Button
                  title="Pair"
                  onPress={() => handleConnectDevice(dev)}
                  variant="primary"
                  size="sm"
                />
              </Card>
            ))
          ) : (
            !isScanning && (
              <Card className="items-center py-6">
                <XCircle size={28} className="text-slate-300 dark:text-slate-700 mb-2" />
                <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">No matching peripherals found.</Text>
              </Card>
            )
          )}
        </View>
      )}

      {/* Toggle Simulator Mode */}
      <Card className="bg-slate-100/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 flex-row items-center justify-between p-4 mb-6">
        <View className="flex-1 pr-3 flex-row items-center">
          <ShieldCheck size={20} className="text-teal-600 dark:text-teal-400 mr-3" />
          <View className="flex-1">
            <Text className="text-xs font-bold text-slate-800 dark:text-white">Smartwatch Sandbox Simulator</Text>
            <Text className="text-xxs text-slate-400 dark:text-slate-500 leading-3 mt-0.5">
              Simulate BLE packets without needing physical hardware boards.
            </Text>
          </View>
        </View>
        <Switch
          value={isSimulatorMode}
          onValueChange={setSimulatorMode}
          trackColor={{ false: '#94A3B8', true: '#0D9488' }}
          thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
        />
      </Card>

    </ScrollView>
  );
}
