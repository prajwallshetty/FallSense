import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { locationService } from '../../services/locationService';
import { notificationService } from '../../services/notificationService';
import { Bluetooth, MapPin, Bell, CheckCircle2 } from 'lucide-react-native';

export default function PermissionsScreen() {
  const router = useRouter();

  const [bleStatus, setBleStatus] = useState<'prompt' | 'granted'>('prompt');
  const [gpsStatus, setGpsStatus] = useState<'prompt' | 'granted'>('prompt');
  const [pushStatus, setPushStatus] = useState<'prompt' | 'granted'>('prompt');

  const requestBluetooth = async () => {
    // Simulated Bluetooth authorization
    setBleStatus('granted');
  };

  const requestLocation = async () => {
    const granted = await locationService.requestPermissions();
    if (granted) {
      setGpsStatus('granted');
    } else {
      Alert.alert('Permission Denied', 'SafeFall AI requires location access to transmit correct coordinates in emergencies.');
    }
  };

  const requestNotifications = async () => {
    const granted = await notificationService.requestPermissions();
    if (granted) {
      setPushStatus('granted');
    } else {
      Alert.alert('Permission Denied', 'Enable push notifications to receive real-time fall warnings.');
    }
  };

  const handleNext = () => {
    if (gpsStatus !== 'granted') {
      Alert.alert('Location Required', 'Please authorize Location access before proceeding to ensure safety tracking.');
      return;
    }
    router.replace('/(onboarding)/contact-setup');
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-900 px-6 py-12 justify-between">
      <View className="mt-12">
        <Text className="text-xxs font-extrabold uppercase tracking-widest text-teal-400">Step 2 of 3</Text>
        <Text className="text-2xl font-extrabold text-white mt-1">Authorize Permissions</Text>
        <Text className="text-sm text-slate-400 mt-2">
          We require these services to coordinate hardware connections and emergency dispatches.
        </Text>

        <View className="space-y-4 mt-8">
          
          {/* Bluetooth permission */}
          <View className="flex-row items-center justify-between bg-slate-800/40 border border-slate-800 p-5 rounded-2xl mb-4">
            <View className="flex-row items-center flex-1 pr-4">
              <View className="p-2.5 bg-blue-500/10 rounded-xl mr-3.5">
                <Bluetooth size={22} className="text-blue-400" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white mb-0.5">Bluetooth Connectivity</Text>
                <Text className="text-xs text-slate-400 leading-4">Pair and synchronise fall alerts from ESP32 smartwatch.</Text>
              </View>
            </View>
            {bleStatus === 'granted' ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : (
              <Button title="Enable" onPress={requestBluetooth} variant="outline" size="sm" className="border-slate-700" />
            )}
          </View>

          {/* Location permission */}
          <View className="flex-row items-center justify-between bg-slate-800/40 border border-slate-800 p-5 rounded-2xl mb-4">
            <View className="flex-row items-center flex-1 pr-4">
              <View className="p-2.5 bg-teal-500/10 rounded-xl mr-3.5">
                <MapPin size={22} className="text-teal-400" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white mb-0.5">GPS Location Dispatch</Text>
                <Text className="text-xs text-slate-400 leading-4">Identifies exact coordinates when a fall is detected.</Text>
              </View>
            </View>
            {gpsStatus === 'granted' ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : (
              <Button title="Enable" onPress={requestLocation} variant="outline" size="sm" className="border-slate-700" />
            )}
          </View>

          {/* Notifications permission */}
          <View className="flex-row items-center justify-between bg-slate-800/40 border border-slate-800 p-5 rounded-2xl mb-4">
            <View className="flex-row items-center flex-1 pr-4">
              <View className="p-2.5 bg-amber-500/10 rounded-xl mr-3.5">
                <Bell size={22} className="text-amber-400" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white mb-0.5">Push Notifications</Text>
                <Text className="text-xs text-slate-400 leading-4">Receive crucial alert updates & watch offline notifications.</Text>
              </View>
            </View>
            {pushStatus === 'granted' ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : (
              <Button title="Enable" onPress={requestNotifications} variant="outline" size="sm" className="border-slate-700" />
            )}
          </View>

        </View>
      </View>

      <View className="mb-6">
        <Button
          title="Continue to Contacts Setup"
          onPress={handleNext}
          variant="primary"
          size="lg"
          className="w-full font-bold"
        />
      </View>
    </ScrollView>
  );
}
