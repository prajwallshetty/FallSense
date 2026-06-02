import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ChevronLeft, Database, Users, ShieldAlert, Cpu, Activity } from 'lucide-react-native';

export default function AdminScreen() {
  const router = useRouter();

  // Mock global server metrics
  const serverMetrics = {
    totalUsers: 1250,
    activeWearables: 840,
    alertCount30d: 42,
    falseAlarmRate: '6.4%',
    systemUptime: '99.98%'
  };

  const handleSystemMaintenance = () => {
    Alert.alert(
      'System Command',
      'Run complete database optimization and backup cycle now?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Execute', onPress: () => Alert.alert('Command Executed', 'Cloud database indexes rebuilt successfully.') }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Back button */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        style={s.backBtn}
      >
        <ChevronLeft size={20} color="#94A3B8" style={s.mr1} />
        <Text style={s.backText}>Settings</Text>
      </Pressable>

      <View style={s.mb6}>
        <Text style={s.headerTitle}>Admin Analytics Hub</Text>
        <Text style={s.headerSubtitle}>App-wide status, databases, and configuration thresholds</Text>
      </View>

      {/* Grid of Key Performance Indicators */}
      <View style={s.kpiGrid}>
        
        {/* Total Registrations */}
        <View style={s.kpiCard}>
          <View style={s.kpiHeader}>
            <Text style={s.kpiLabel}>Users Registry</Text>
            <Users size={16} color="#0D9488" />
          </View>
          <Text style={s.kpiValue}>{serverMetrics.totalUsers}</Text>
          <Text style={s.kpiTrendGreen}>+12% this week</Text>
        </View>

        {/* Live ESP32 links */}
        <View style={s.kpiCard}>
          <View style={s.kpiHeader}>
            <Text style={s.kpiLabel}>Active BLE Wearables</Text>
            <Cpu size={16} color="#3B82F6" />
          </View>
          <Text style={s.kpiValue}>{serverMetrics.activeWearables}</Text>
          <Text style={s.kpiTrendSlate}>Syncing continuous</Text>
        </View>

        {/* Alert events */}
        <View style={s.kpiCard}>
          <View style={s.kpiHeader}>
            <Text style={s.kpiLabel}>Fall incidents (30d)</Text>
            <ShieldAlert size={16} color="#EF4444" />
          </View>
          <Text style={s.kpiValue}>{serverMetrics.alertCount30d}</Text>
          <Text style={s.kpiTrendRed}>All resolved</Text>
        </View>

        {/* False alarms */}
        <View style={s.kpiCard}>
          <View style={s.kpiHeader}>
            <Text style={s.kpiLabel}>False Alarm Ratio</Text>
            <Activity size={16} color="#F59E0B" />
          </View>
          <Text style={s.kpiValue}>{serverMetrics.falseAlarmRate}</Text>
          <Text style={s.kpiTrendGreen}>Target: &lt; 8.0%</Text>
        </View>
      </View>

      {/* Server & DB Status */}
      <Card style={s.mb6}>
        <View style={s.dbHeader}>
          <View style={s.row}>
            <Database size={18} color="#94A3B8" style={s.mr2} />
            <Text style={s.dbTitle}>Database Gateway Services</Text>
          </View>
          <View style={s.onlineBadge}>
            <Text style={s.onlineBadgeText}>Online</Text>
          </View>
        </View>

        <View style={s.dbDetails}>
          <View style={s.dbRow}>
            <Text style={s.dbLabel}>Firebase Firestore Uptime</Text>
            <Text style={s.dbValue}>{serverMetrics.systemUptime}</Text>
          </View>
          <View style={s.dbRow}>
            <Text style={s.dbLabel}>API Gateway latency</Text>
            <Text style={s.dbValue}>14 ms</Text>
          </View>
          <View style={s.dbRowLast}>
            <Text style={s.dbLabel}>Cloud Storage usage</Text>
            <Text style={s.dbValue}>12.4 GB</Text>
          </View>
        </View>

        <Button
          title="Optimize Cloud Database"
          onPress={handleSystemMaintenance}
          variant="outline"
          size="md"
          style={s.optimizeBtn}
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  mr1: { marginRight: 4 },
  mr2: { marginRight: 8 },
  mb6: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    width: '47%',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    borderRadius: 16,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  kpiTrendGreen: { fontSize: 10, color: '#10B981', fontWeight: '600', marginTop: 4 },
  kpiTrendSlate: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 4 },
  kpiTrendRed: { fontSize: 10, color: '#F87171', fontWeight: '600', marginTop: 4 },
  dbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,41,59,0.5)',
  },
  dbTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  onlineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 4,
  },
  onlineBadgeText: { fontSize: 10, fontWeight: '700', color: '#10B981', textTransform: 'uppercase' },
  dbDetails: { marginBottom: 16 },
  dbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dbRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dbLabel: { fontSize: 12, color: '#94A3B8' },
  dbValue: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  optimizeBtn: { width: '100%', borderColor: '#334155' },
});
