import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Switch, Platform, StyleSheet } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Header */}
      <View style={s.headerContainer}>
        <Text style={s.headerLabel}>
          Hardware Interface
        </Text>
        <Text style={s.headerTitle}>
          Smartwatch Manager
        </Text>
      </View>

      {/* Connection State Card */}
      {pairedDevice ? (
        <Card style={s.mb4}>
          <View style={s.deviceHeaderRow}>
            <View style={s.row}>
              <View style={s.iconBgTeal}>
                <Cpu size={24} color="#0D9488" />
              </View>
              <View>
                <Text style={s.deviceName}>{pairedDevice.name}</Text>
                <Text style={s.deviceMac}>{pairedDevice.macAddress}</Text>
              </View>
            </View>
            <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
          </View>

          <View style={s.detailsSection}>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Firmware Build</Text>
              <Text style={s.detailValue}>v{pairedDevice.firmwareVersion}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Battery Level</Text>
              <Text style={[s.detailValue, pairedDevice.batteryLevel < 20 && s.textRed]}>
                {pairedDevice.batteryLevel}%
              </Text>
            </View>
            <View style={s.detailRowLast}>
              <Text style={s.detailLabel}>BLE Status</Text>
              <Text style={s.detailValue}>Monitoring Active</Text>
            </View>
          </View>

          <Button
            title="Disconnect Watch"
            onPress={handleDisconnect}
            variant="outline"
            size="md"
            style={s.disconnectBtn}
          />
        </Card>
      ) : (
        <Card style={s.emptyCard}>
          <Bluetooth size={44} color="#475569" style={s.mb3} />
          <Text style={s.emptyTitle}>No Wearable Paired</Text>
          <Text style={s.emptySubtitle}>
            Scan and connect to the SafeFall Smartwatch to activate automatic fall monitoring and vitals telemetry.
          </Text>
          <Button
            title="Start Bluetooth Scan"
            onPress={startDiscovery}
            variant="primary"
            size="lg"
            style={s.fullWidth}
          />
        </Card>
      )}

      {/* Bluetooth scan results list */}
      {scanTriggered && (
        <View style={s.mb6}>
          <View style={s.scanHeader}>
            <Text style={s.scanTitle}>Nearby BLE Peripherals</Text>
            {isScanning && <ActivityIndicator size="small" color="#0D9488" />}
          </View>

          {scannedDevices.length > 0 ? (
            scannedDevices.map((dev) => (
              <Card key={dev.deviceId} style={s.scanResultCard}>
                <View style={s.row}>
                  <Smartphone size={20} color="#94A3B8" style={s.mr3} />
                  <View>
                    <Text style={s.scanDevName}>{dev.name}</Text>
                    <Text style={s.scanDevMac}>{dev.macAddress}</Text>
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
              <Card style={s.noResultsCard}>
                <XCircle size={28} color="#334155" style={s.mb2} />
                <Text style={s.noResultsText}>No matching peripherals found.</Text>
              </Card>
            )
          )}
        </View>
      )}

      {/* Toggle Simulator Mode */}
      <Card style={s.simulatorCard}>
        <View style={s.simulatorLeft}>
          <ShieldCheck size={20} color="#0D9488" style={s.mr3} />
          <View style={s.flex1}>
            <Text style={s.simulatorTitle}>Smartwatch Sandbox Simulator</Text>
            <Text style={s.simulatorSubtitle}>
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

const s = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  headerContainer: { marginBottom: 24 },
  headerLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#64748B',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mb2: { marginBottom: 8 },
  mb3: { marginBottom: 12 },
  mb4: { marginBottom: 16 },
  mb6: { marginBottom: 24 },
  mr3: { marginRight: 12 },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  fullWidth: { width: '100%' },
  deviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBgTeal: {
    padding: 12,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderRadius: 16,
    marginRight: 12,
  },
  deviceName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  deviceMac: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.8)',
    paddingTop: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: { fontSize: 12, color: '#94A3B8' },
  detailValue: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  textRed: { color: '#EF4444' },
  disconnectBtn: {
    width: '100%',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  emptyCard: {
    marginBottom: 16,
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
    marginBottom: 24,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  scanTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scanResultCard: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  scanDevName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scanDevMac: { fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' },
  noResultsCard: { alignItems: 'center', paddingVertical: 24 },
  noResultsText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  simulatorCard: {
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderColor: 'rgba(30,41,59,0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 24,
  },
  simulatorLeft: {
    flex: 1,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  simulatorTitle: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  simulatorSubtitle: { fontSize: 10, color: '#64748B', lineHeight: 14, marginTop: 2 },
});
