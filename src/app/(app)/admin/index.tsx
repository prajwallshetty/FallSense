import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Back button */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        className="flex-row items-center mb-4 self-start"
      >
        <ChevronLeft size={20} className="text-slate-400 mr-1" />
        <Text className="text-sm font-semibold text-slate-400">Settings</Text>
      </Pressable>

      <View className="mb-6">
        <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">Admin Analytics Hub</Text>
        <Text className="text-sm text-slate-400 dark:text-slate-500 mt-1">App-wide status, databases, and configuration thresholds</Text>
      </View>

      {/* Grid of Key Performance Indicators */}
      <View className="flex-row flex-wrap justify-between gap-3 mb-6">
        
        {/* Total Registrations */}
        <View className="w-[47%] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xxs font-bold text-slate-400 uppercase">Users Registry</Text>
            <Users size={16} className="text-teal-500" />
          </View>
          <Text className="text-xl font-extrabold text-slate-800 dark:text-white">{serverMetrics.totalUsers}</Text>
          <Text className="text-xxs text-emerald-500 font-semibold mt-1">+12% this week</Text>
        </View>

        {/* Live ESP32 links */}
        <View className="w-[47%] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xxs font-bold text-slate-400 uppercase">Active BLE Wearables</Text>
            <Cpu size={16} className="text-blue-500" />
          </View>
          <Text className="text-xl font-extrabold text-slate-800 dark:text-white">{serverMetrics.activeWearables}</Text>
          <Text className="text-xxs text-slate-400 font-semibold mt-1">Syncing continuous</Text>
        </View>

        {/* Alert events */}
        <View className="w-[47%] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xxs font-bold text-slate-400 uppercase">Fall incidents (30d)</Text>
            <ShieldAlert size={16} className="text-red-500" />
          </View>
          <Text className="text-xl font-extrabold text-slate-800 dark:text-white">{serverMetrics.alertCount30d}</Text>
          <Text className="text-xxs text-red-400 font-semibold mt-1">All resolved</Text>
        </View>

        {/* False alarms */}
        <View className="w-[47%] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xxs font-bold text-slate-400 uppercase">False Alarm Ratio</Text>
            <Activity size={16} className="text-amber-500" />
          </View>
          <Text className="text-xl font-extrabold text-slate-800 dark:text-white">{serverMetrics.falseAlarmRate}</Text>
          <Text className="text-xxs text-emerald-500 font-semibold mt-1">Target: &lt; 8.0%</Text>
        </View>
      </View>

      {/* Server & DB Status */}
      <Card className="mb-6">
        <View className="flex-row items-center justify-between mb-4 pb-2 border-b border-slate-50 dark:border-slate-850">
          <View className="flex-row items-center">
            <Database size={18} className="text-slate-600 dark:text-slate-400 mr-2" />
            <Text className="text-sm font-bold text-slate-800 dark:text-white">Database Gateway Services</Text>
          </View>
          <View className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded">
            <Text className="text-xxs font-bold text-emerald-600 uppercase">Online</Text>
          </View>
        </View>

        <View className="space-y-2 mb-4">
          <View className="flex-row justify-between mb-2">
            <Text className="text-xs text-slate-500">Firebase Firestore Uptime</Text>
            <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">{serverMetrics.systemUptime}</Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-xs text-slate-500">API Gateway latency</Text>
            <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">14 ms</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-500">Cloud Storage usage</Text>
            <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">12.4 GB</Text>
          </View>
        </View>

        <Button
          title="Optimize Cloud Database"
          onPress={handleSystemMaintenance}
          variant="outline"
          size="md"
          className="w-full border-slate-200"
        />
      </Card>

    </ScrollView>
  );
}
