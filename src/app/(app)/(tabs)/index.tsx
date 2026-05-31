import React from 'react';
import { View, Text, ScrollView, Alert, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useDeviceStore } from '../../../store/deviceStore';
import { bleService } from '../../../services/bleService';
import { BatteryRing } from '../../../components/Dashboard/BatteryRing';
import { LiveStatusCard } from '../../../components/Dashboard/LiveStatusCard';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { PhoneCall, AlertTriangle, Flame, ShieldAlert, Footprints, Clock, ArrowRight } from 'lucide-react-native';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, activeElderlyProfile } = useAuthStore();
  const { pairedDevice, isConnected, isSimulatorMode } = useDeviceStore();

  const isCaregiver = user?.role === 'caregiver';
  const displayedUser = isCaregiver ? (activeElderlyProfile || user) : user;

  const stepsGoal = 8000;
  const currentSteps = 3450; // mock data
  const progressPercent = Math.min(100, Math.round((currentSteps / stepsGoal) * 100));

  // Quick emergency dispatcher
  const handleQuickEmergencyTrigger = () => {
    Alert.alert(
      'ALERT DISPATCH',
      'Are you sure you want to trigger an immediate Emergency Broadcast to all contacts?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'EMERGENCY', 
          style: 'destructive',
          onPress: () => {
            // Trigger emergency fall sequence directly
            bleService.simulateFallEvent();
          } 
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* User Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-xxs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {isCaregiver ? 'Monitoring Patient' : 'SafeFall Protection'}
          </Text>
          <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">
            Hello, {displayedUser?.fullName.split(' ')[0]}!
          </Text>
        </View>

        {isCaregiver && (
          <Pressable 
            onPress={() => router.push('/(app)/caregiver')}
            className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-full flex-row items-center"
          >
            <Text className="text-xxs font-bold text-teal-600 dark:text-teal-400 uppercase mr-1">Switch Patient</Text>
            <ArrowRight size={12} className="text-teal-600 dark:text-teal-400" />
          </Pressable>
        )}
      </View>

      {/* Main Devices Ring and Connectivity Status */}
      <Card className="items-center py-6 mb-4">
        <View className="flex-row w-full justify-around items-center">
          {/* Battery ring */}
          <BatteryRing percentage={pairedDevice && isConnected ? pairedDevice.batteryLevel : 0} />
          
          {/* Vitals Summary Column */}
          <View className="space-y-2">
            <View>
              <Text className="text-xxs font-bold uppercase text-slate-400 dark:text-slate-500">Fall Monitor</Text>
              <Text className={`text-base font-extrabold ${isConnected ? 'text-emerald-500' : 'text-slate-400'}`}>
                {isConnected ? 'SENSING LIVE' : 'OFFLINE'}
              </Text>
            </View>
            <View>
              <Text className="text-xxs font-bold uppercase text-slate-400 dark:text-slate-500">Last Sync Time</Text>
              <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {pairedDevice && isConnected ? 'Just now' : 'Yesterday'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Live BLE status panel */}
      <LiveStatusCard />

      {/* Emergency dispatch alert action targets */}
      <View className="mb-4">
        <Pressable
          onPress={handleQuickEmergencyTrigger}
          className="bg-red-500 active:bg-red-600 border border-red-400/20 rounded-3xl p-5 flex-row items-center justify-between shadow-md"
        >
          <View className="flex-row items-center">
            <View className="p-3 bg-white/20 rounded-2xl mr-4">
              <PhoneCall size={28} className="text-white" />
            </View>
            <View>
              <Text className="text-lg font-black text-white">Emergency Call</Text>
              <Text className="text-xs text-white/80 font-medium">Alerts priority caregivers immediately</Text>
            </View>
          </View>
          <View className="w-10 h-10 rounded-full bg-white/20 items-center justify-center">
            <ShieldAlert size={20} className="text-white animate-pulse" />
          </View>
        </Pressable>
      </View>

      {/* Daily activity logs */}
      <Card className="mb-4">
        <Text className="text-base font-bold text-slate-800 dark:text-white mb-4">Daily Activity Summary</Text>
        
        <View className="flex-row justify-between mb-4">
          <View className="flex-row items-center">
            <View className="p-2.5 bg-teal-50 dark:bg-teal-950/20 rounded-xl mr-3">
              <Footprints size={20} className="text-teal-500" />
            </View>
            <View>
              <Text className="text-xxs font-bold text-slate-400 uppercase">Step Counter</Text>
              <Text className="text-base font-bold text-slate-800 dark:text-white">{currentSteps} / {stepsGoal}</Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-xxs font-bold text-slate-400 uppercase">Target</Text>
            <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">{progressPercent}% done</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
          <View className="h-full bg-teal-500 rounded-full" style={{ width: `${progressPercent}%` }} />
        </View>

        <View className="flex-row justify-between border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <View className="items-center flex-1">
            <Text className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Active Time</Text>
            <Text className="text-base font-bold text-slate-800 dark:text-white">24 min</Text>
          </View>
          <View className="items-center flex-1 border-x border-slate-100 dark:border-slate-800/80">
            <Text className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Calories</Text>
            <Text className="text-base font-bold text-slate-800 dark:text-white">180 kcal</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Vitals Level</Text>
            <Text className="text-base font-bold text-slate-800 dark:text-white">Normal</Text>
          </View>
        </View>
      </Card>

      {/* Simulator Tools Controls panel if Developer Sandbox */}
      {isSimulatorMode && isConnected && (
        <Card className="border-teal-500/20 bg-teal-500/5 dark:bg-teal-500/10 mb-6">
          <View className="flex-row items-center mb-3">
            <AlertTriangle size={18} className="text-teal-600 dark:text-teal-400 mr-2" />
            <Text className="text-sm font-bold text-teal-600 dark:text-teal-400">Simulator Sandbox Tools</Text>
          </View>
          <Text className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-4">
            Simulate a high-impact fall vector (accelerometer spikes) from the ESP32 smartwatch. This will launch the global alert modal.
          </Text>
          <Button
            title="Simulate Smartwatch Fall Alert"
            onPress={() => bleService.simulateFallEvent()}
            variant="danger"
            size="md"
          />
        </Card>
      )}
    </ScrollView>
  );
}
