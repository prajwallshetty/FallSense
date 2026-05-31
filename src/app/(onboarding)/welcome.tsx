import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Heart, Shield, Radio, ChevronRight } from 'lucide-react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isCaregiver = user?.role === 'caregiver';

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-900 px-6 py-12 justify-between">
      {/* Top Banner */}
      <View className="items-center mt-12 mb-4">
        <Heart size={48} className="text-teal-400" />
        <Text className="text-3xl font-extrabold text-white mt-4 text-center">
          Welcome to SafeFall AI
        </Text>
        <Text className="text-sm text-slate-400 text-center mt-2 px-4">
          Hello {user?.fullName || 'User'}, let's complete a quick 3-step setup to activate real-time fall detection monitoring.
        </Text>
      </View>

      {/* Highlights List */}
      <View className="space-y-4 my-8">
        {/* Core Protection */}
        <View className="flex-row items-start bg-slate-800/40 border border-slate-800 p-4.5 rounded-2xl mb-4">
          <View className="p-2.5 bg-teal-500/10 rounded-xl mr-3.5">
            <Shield size={24} className="text-teal-400" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-white mb-1">
              {isCaregiver ? 'Continuous Elderly Tracking' : 'Automatic Fall Sensing'}
            </Text>
            <Text className="text-xs text-slate-400 leading-4.5">
              {isCaregiver 
                ? 'Get notified immediately if an elderly parent falls, with full telemetry log context and battery alerts.' 
                : 'Your paired smartwatch reads acceleration forces. If a sudden impact occurs, the system starts a countdown.'}
            </Text>
          </View>
        </View>

        {/* GPS Tracking */}
        <View className="flex-row items-start bg-slate-800/40 border border-slate-800 p-4.5 rounded-2xl mb-4">
          <View className="p-2.5 bg-teal-500/10 rounded-xl mr-3.5">
            <Radio size={24} className="text-teal-400" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-white mb-1">
              Active Geolocation Dispatch
            </Text>
            <Text className="text-xs text-slate-400 leading-4.5">
              If a fall occurs, the exact GPS coordinates and matching street address are shared instantly with caregivers and emergency services.
            </Text>
          </View>
        </View>
      </View>

      {/* Call to Action */}
      <View className="mb-6">
        <Button
          title="Configure System Permissions"
          onPress={() => router.replace('/(onboarding)/permissions')}
          variant="primary"
          size="lg"
          className="w-full flex-row items-center justify-center font-bold"
        />
      </View>
    </ScrollView>
  );
}
