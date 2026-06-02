import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useDeviceStore } from '../../store/deviceStore';
import { StatusBadge } from '../ui/StatusBadge';
import { Card } from '../ui/Card';
import { Cpu, Wifi, RefreshCw } from 'lucide-react-native';

export const LiveStatusCard: React.FC = () => {
  const { pairedDevice, isConnected, telemetry } = useDeviceStore();

  const currentRssi = pairedDevice?.rssi || -70;
  
  const getSignalStrength = (rssi: number) => {
    if (rssi > -60) return 'Excellent';
    if (rssi > -75) return 'Good';
    if (rssi > -85) return 'Fair';
    return 'Weak';
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -60) return '#10B981';
    if (rssi > -75) return '#14B8A6';
    if (rssi > -85) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Cpu size={24} color="#0D9488" />
          </View>
          <View>
            <Text style={styles.deviceName}>
              {pairedDevice ? pairedDevice.name : 'No Smartwatch Paired'}
            </Text>
            <Text style={styles.deviceFw}>
              {pairedDevice ? `FW: v${pairedDevice.firmwareVersion}` : 'Go to Device Scan to connect'}
            </Text>
          </View>
        </View>
        <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
      </View>

      {pairedDevice ? (
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalCard}>
            <View style={styles.vitalHeader}>
              <Text style={styles.vitalTitle}>Signal Strength</Text>
              <Wifi size={16} color={getSignalColor(currentRssi)} />
            </View>
            <Text style={styles.vitalValue}>{currentRssi} dBm</Text>
            <Text style={styles.vitalSubtitle}>{getSignalStrength(currentRssi)} Link</Text>
          </View>

          <View style={styles.vitalCard}>
            <View style={styles.vitalHeader}>
              <Text style={styles.vitalTitle}>Fall Protection</Text>
              <RefreshCw size={16} color={isConnected ? '#14B8A6' : '#94A3B8'} />
            </View>
            <Text style={styles.vitalValue}>{isConnected ? 'Active & Live' : 'Offline'}</Text>
            <Text style={styles.vitalSubtitle}>{isConnected ? 'Continuous Sync' : 'Reconnecting...'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.noDeviceContainer}>
          <Text style={styles.noDeviceText}>
            Pair your smartwatch via BLE in the Devices tab to enable continuous fall-detection and telemetry sync.
          </Text>
        </View>
      )}

      {isConnected && telemetry && (
        <View style={styles.telemetryContainer}>
          <Text style={styles.telemetryTitle}>Sensor Telemetry (MPU6050 Live)</Text>
          
          <View style={styles.telemetryGrid}>
            <View>
              <Text style={styles.telemetryLabel}>Accel (G-Force)</Text>
              <Text style={styles.telemetryValue}>
                X: {telemetry.accelX.toFixed(2)} | Y: {telemetry.accelY.toFixed(2)} | Z: {telemetry.accelZ.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.telemetryLabel}>Gyro (deg/s)</Text>
              <Text style={styles.telemetryValue}>
                X: {telemetry.gyroX.toFixed(0)}° | Y: {telemetry.gyroY.toFixed(0)}° | Z: {telemetry.gyroZ.toFixed(0)}°
              </Text>
            </View>
          </View>

          <View>
            <View style={styles.confidenceHeader}>
              <Text style={styles.telemetryLabel}>Fall Confidence Index</Text>
              <Text style={[styles.confidenceValue, { color: telemetry.fallScore > 70 ? '#EF4444' : '#14B8A6' }]}>
                {telemetry.fallScore}%
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View 
                style={[styles.progressFill, { 
                  width: `${telemetry.fallScore}%`,
                  backgroundColor: telemetry.fallScore > 70 ? '#EF4444' : '#14B8A6'
                }]}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#1E293B', paddingBottom: 16, marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: { padding: 10, backgroundColor: 'rgba(13,148,136,0.1)', borderRadius: 12, marginRight: 12 },
  deviceName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  deviceFw: { fontSize: 12, color: '#94A3B8' },
  vitalsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  vitalCard: { width: '48%', backgroundColor: '#020617', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1E293B' },
  vitalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  vitalTitle: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  vitalValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  vitalSubtitle: { fontSize: 10, color: '#64748B', textTransform: 'uppercase', fontWeight: '600', marginTop: 2 },
  noDeviceContainer: { alignItems: 'center', paddingVertical: 16 },
  noDeviceText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  telemetryContainer: { marginTop: 16, backgroundColor: 'rgba(2,6,23,0.5)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(30,41,59,0.8)' },
  telemetryTitle: { fontSize: 12, fontWeight: '700', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  telemetryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  telemetryLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  telemetryValue: { fontSize: 14, fontWeight: '600', color: '#E2E8F0' },
  confidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  confidenceValue: { fontSize: 12, fontWeight: '700' },
  progressBg: { height: 8, width: '100%', backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
});
