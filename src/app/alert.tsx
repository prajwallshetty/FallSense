import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAlertStore } from '../store/alertStore';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
import { Button } from '../components/ui/Button';
import { ShieldAlert, MapPin, BellRing, Volume2, VolumeX } from 'lucide-react-native';

export default function AlertScreen() {
  const router = useRouter();
  const { activeAlert, countdown, isTimerActive, cancelAlert, acknowledgeAlert } = useAlertStore();
  const { user } = useAuthStore();

  const flashAnim = useRef(new Animated.Value(0.15)).current;

  // 1. Setup siren audio and flashing visual animation on mount
  useEffect(() => {
    notificationService.startEmergencySiren();
    
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0.15,
          duration: 650,
          useNativeDriver: true,
        })
      ])
    );
    animation.start();

    return () => {
      notificationService.stopEmergencySiren();
      animation.stop();
    };
  }, [flashAnim]);

  // 2. React to alert removal
  useEffect(() => {
    if (!activeAlert) {
      router.replace('/(app)/(tabs)');
    }
  }, [activeAlert]);

  const handleCancelFalseAlarm = () => {
    Alert.alert(
      'Cancel Alarm',
      'Confirm this was a false alarm? The siren will silence and no dispatch will be sent.',
      [
        { text: 'Keep Alert Active', style: 'default' },
        { 
          text: 'Dismiss False Alarm', 
          style: 'destructive',
          onPress: () => {
            notificationService.stopEmergencySiren();
            cancelAlert();
          } 
        }
      ]
    );
  };

  const handleEscalateDispatch = () => {
    // Immediately escalate alerts to contacts
    if (user) {
      acknowledgeAlert(user.userId);
      Alert.alert('Dispatched!', 'Caregivers and responders have been successfully alerted.');
    }
  };

  if (!activeAlert) return null;

  return (
    <View className="flex-1 bg-slate-950 relative justify-between px-6 py-14">
      
      {/* Red flashing overlay bg */}
      <Animated.View 
        className="absolute inset-0 bg-red-600"
        style={{ opacity: flashAnim }}
      />

      {/* Top Banner Alert Info */}
      <View className="items-center mt-10">
        <View className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 items-center justify-center mb-6 animate-pulse">
          <ShieldAlert size={44} className="text-red-500" />
        </View>
        <Text className="text-3xl font-black text-white tracking-widest text-center">
          {activeAlert.status === 'escalated' ? 'DISPATCH ACTIVE' : 'FALL DETECTED'}
        </Text>
        <Text className="text-sm font-bold text-red-200 mt-2 text-center uppercase tracking-widest">
          {activeAlert.status === 'escalated' ? 'Responders notified' : 'Checking client vitals'}
        </Text>
      </View>

      {/* Center Countdown or Status details */}
      <View className="items-center my-6">
        {activeAlert.status === 'pending' ? (
          <View className="items-center">
            <Text className="text-7xl font-black text-white">{countdown}</Text>
            <Text className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-2">
              seconds to auto-escalation
            </Text>
          </View>
        ) : (
          <View className="bg-red-500/20 border border-red-500/30 p-5 rounded-2xl items-center">
            <BellRing size={32} className="text-red-400 animate-bounce mb-2" />
            <Text className="text-sm font-bold text-white text-center">Emergency Broadcast Broadcasted</Text>
            <Text className="text-xs text-red-200 text-center mt-1 leading-4">
              Caregivers and primary responders were notified with GPS telemetry data.
            </Text>
          </View>
        )}
      </View>

      {/* Patient Location and details card */}
      <View className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-3xl mb-4">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
          Patient Status
        </Text>
        
        <Text className="text-lg font-black text-white mb-2">
          {activeAlert.userName}
        </Text>

        <View className="flex-row items-start mb-1">
          <MapPin size={16} className="text-red-500 mr-2 mt-0.5" />
          <View className="flex-1">
            <Text className="text-xs text-slate-300 leading-4">
              {activeAlert.location.address || 'Address lookup pending...'}
            </Text>
            <Text className="text-xxs text-slate-500 font-bold mt-1 uppercase">
              Lat: {activeAlert.location.latitude.toFixed(5)} | Lng: {activeAlert.location.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      </View>

      {/* Controls Action panel */}
      <View className="space-y-4 mb-4">
        {activeAlert.status === 'pending' ? (
          <View className="space-y-3">
            <Button
              title="Cancel (False Alarm)"
              onPress={handleCancelFalseAlarm}
              variant="outline"
              size="lg"
              className="w-full border-slate-700 bg-slate-900 text-white min-h-[58px]"
            />
            
            <Button
              title="Dispatch Responders Now"
              onPress={handleEscalateDispatch}
              variant="danger"
              size="lg"
              className="w-full min-h-[58px] font-bold"
            />
          </View>
        ) : (
          <Button
            title="Acknowledge & Close Screen"
            onPress={() => {
              notificationService.stopEmergencySiren();
              if (user) acknowledgeAlert(user.userId);
              router.replace('/(app)/(tabs)');
            }}
            variant="primary"
            size="lg"
            className="w-full min-h-[58px]"
          />
        )}
      </View>

    </View>
  );
}
