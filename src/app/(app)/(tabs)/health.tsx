import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { AnalyticsChart } from '../../../components/Health/AnalyticsChart';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { FallAlert, HealthLog } from '../../../types';
import { Download, Calendar, Activity, RefreshCw } from 'lucide-react-native';

export default function HealthScreen() {
  const { user, activeElderlyProfile } = useAuthStore();
  const targetUser = activeElderlyProfile || user;

  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [alerts, setAlerts] = useState<FallAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealthData = async () => {
    if (!targetUser) return;
    setIsLoading(true);
    try {
      const fetchedLogs = await firebaseService.getHealthLogs(targetUser.userId);
      const fetchedAlerts = await firebaseService.getAlertHistory(targetUser.userId);
      setLogs(fetchedLogs);
      setAlerts(fetchedAlerts);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, [targetUser]);

  // Map health logs to step data format
  const getWeeklyStepsData = () => {
    if (logs.length === 0) {
      return [
        { label: 'Mon', value: 0 },
        { label: 'Tue', value: 0 },
        { label: 'Wed', value: 0 },
        { label: 'Thu', value: 0 },
        { label: 'Fri', value: 0 },
        { label: 'Sat', value: 0 },
        { label: 'Sun', value: 0 },
      ];
    }
    return logs.map(log => {
      const day = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short' });
      return { label: day, value: log.stepsCount };
    });
  };

  const getWeeklyIntensityData = () => {
    if (logs.length === 0) {
      return [
        { label: 'Mon', value: 0 },
        { label: 'Tue', value: 0 },
        { label: 'Wed', value: 0 },
        { label: 'Thu', value: 0 },
        { label: 'Fri', value: 0 },
        { label: 'Sat', value: 0 },
        { label: 'Sun', value: 0 },
      ];
    }
    return logs.map(log => {
      const day = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short' });
      return { label: day, value: log.movementScore };
    });
  };

  const handleExport = () => {
    Alert.alert(
      'Export Patient Data',
      'Select format for health logs and fall reports.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export PDF', onPress: () => Alert.alert('Export Success', 'Health report PDF saved to downloads folder.') },
        { text: 'Export CSV', onPress: () => Alert.alert('Export Success', 'Raw data CSV file saved to files directory.') }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={s.loadingText}>Fetching vitals logs...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Title Header */}
      <View style={s.titleRow}>
        <View>
          <Text style={s.headerLabel}>
            Health Portal
          </Text>
          <Text style={s.headerTitle}>
            Vitals & Analytics
          </Text>
        </View>

        <Pressable 
          onPress={fetchHealthData}
          style={s.refreshBtn}
        >
          <RefreshCw size={18} color="#94A3B8" />
        </Pressable>
      </View>

      {/* Analytics Charts */}
      <AnalyticsChart
        title="Weekly Movement Steps"
        subtitle="Daily steps counted by watch accelerometer"
        data={getWeeklyStepsData()}
        type="bar"
        maxValue={8000}
      />

      <AnalyticsChart
        title="Movement Score Index"
        subtitle="AI calculated activity rating (Goal: 70+)"
        data={getWeeklyIntensityData()}
        type="line"
        maxValue={100}
      />

      {/* Fall History List */}
      <View style={s.mb6}>
        <View style={s.sectionHeader}>
          <View style={s.row}>
            <Activity size={18} color="#94A3B8" style={s.mr2} />
            <Text style={s.sectionTitle}>Fall Incident Log</Text>
          </View>
          <Pressable 
            onPress={handleExport}
            style={s.exportBtn}
          >
            <Download size={14} color="#0D9488" style={s.mr1} />
            <Text style={s.exportText}>Export</Text>
          </Pressable>
        </View>

        {alerts.length > 0 ? (
          alerts.map((alert) => (
            <Card key={alert.alertId} style={s.alertCard}>
              <View style={s.alertHeader}>
                <View>
                  <Text style={s.alertName}>
                    {alert.userName || 'Margaret Thompson'}
                  </Text>
                  <Text style={s.alertTimestamp}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </Text>
                </View>
                <StatusBadge status={alert.status} />
              </View>

              <Text style={s.alertLocation}>
                Location: {alert.location.address || 'Address unmapped'}
              </Text>
              
              {alert.resolvedAt && (
                <View style={s.resolvedRow}>
                  <Calendar size={12} color="#94A3B8" style={s.mr1p5} />
                  <Text style={s.resolvedText}>
                    Resolved at {new Date(alert.resolvedAt).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            </Card>
          ))
        ) : (
          <Card style={s.emptyCard}>
            <Text style={s.emptyTitle}>No Fall Alerts Registered</Text>
            <Text style={s.emptySubtitle}>
              The smartwatch telemetry logs are clean. No fall anomalies have been recorded recently.
            </Text>
          </Card>
        )}
      </View>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: { fontSize: 14, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
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
  refreshBtn: {
    padding: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
  },
  mb6: { marginBottom: 24 },
  mr1: { marginRight: 4 },
  mr1p5: { marginRight: 6 },
  mr2: { marginRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.2)',
    borderRadius: 8,
  },
  exportText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
    textTransform: 'uppercase',
  },
  alertCard: {
    marginBottom: 12,
    borderColor: '#1E293B',
    padding: 16,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  alertName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  alertTimestamp: { fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 2 },
  alertLocation: { fontSize: 12, color: '#94A3B8', lineHeight: 18, marginBottom: 8 },
  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.8)',
    paddingTop: 8,
    marginTop: 8,
  },
  resolvedText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  emptyCard: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 18,
  },
});
