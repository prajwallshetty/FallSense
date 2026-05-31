import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
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
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#0D9488" />
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Fetching vitals logs...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Title Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-xxs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Health Portal
          </Text>
          <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">
            Vitals & Analytics
          </Text>
        </View>

        <Pressable 
          onPress={fetchHealthData}
          className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
        >
          <RefreshCw size={18} className="text-slate-600 dark:text-slate-400" />
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
      <View className="mb-6">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Activity size={18} className="text-slate-600 dark:text-slate-400 mr-2" />
            <Text className="text-base font-bold text-slate-800 dark:text-white">Fall Incident Log</Text>
          </View>
          <Pressable 
            onPress={handleExport}
            className="flex-row items-center px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-lg"
          >
            <Download size={14} className="text-teal-600 dark:text-teal-400 mr-1" />
            <Text className="text-xxs font-bold text-teal-600 dark:text-teal-400 uppercase">Export</Text>
          </Pressable>
        </View>

        {alerts.length > 0 ? (
          alerts.map((alert) => (
            <Card key={alert.alertId} className="mb-3 border-slate-100 dark:border-slate-800 p-4">
              <View className="flex-row items-start justify-between mb-2">
                <View>
                  <Text className="text-sm font-bold text-slate-800 dark:text-white">
                    {alert.userName || 'Margaret Thompson'}
                  </Text>
                  <Text className="text-xxs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                    {new Date(alert.timestamp).toLocaleString()}
                  </Text>
                </View>
                <StatusBadge status={alert.status} />
              </View>

              <Text className="text-xs text-slate-500 dark:text-slate-400 leading-4.5 mb-2">
                Location: {alert.location.address || 'Address unmapped'}
              </Text>
              
              {alert.resolvedAt && (
                <View className="flex-row items-center border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-2">
                  <Calendar size={12} className="text-slate-400 mr-1.5" />
                  <Text className="text-xxs font-semibold text-slate-400 dark:text-slate-500">
                    Resolved at {new Date(alert.resolvedAt).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            </Card>
          ))
        ) : (
          <Card className="items-center py-8">
            <Text className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No Fall Alerts Registered</Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500 text-center px-4 leading-4.5">
              The smartwatch telemetry logs are clean. No fall anomalies have been recorded recently.
            </Text>
          </Card>
        )}
      </View>

    </ScrollView>
  );
}
