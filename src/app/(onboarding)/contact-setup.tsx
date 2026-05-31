import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { PhoneCall, HeartHandshake } from 'lucide-react-native';

export default function ContactSetupScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveContact = async () => {
    if (!name || !phone || !relationship) {
      Alert.alert('Incomplete Form', 'Please complete all emergency contact fields before continuing.');
      return;
    }

    setIsLoading(true);
    try {
      if (user) {
        await firebaseService.saveEmergencyContact(user.userId, {
          userId: user.userId,
          name,
          phone,
          relationship,
          priorityOrder: 1,
        });
      }
      
      Alert.alert('Setup Complete', 'Your primary emergency contact has been configured successfully!', [
        {
          text: 'Enter Application',
          onPress: () => {
            // Divert caregiver to caregiver console, patients to standard tab dashboard
            if (user?.role === 'caregiver') {
              router.replace('/(app)/caregiver');
            } else {
              router.replace('/(app)/(tabs)');
            }
          }
        }
      ]);
    } catch (err) {
      Alert.alert('Error Saving Contact', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Allow skipping onboarding contact setup for caregiver roles (they link profiles instead)
  const handleSkip = () => {
    if (user?.role === 'caregiver') {
      router.replace('/(app)/caregiver');
    } else {
      router.replace('/(app)/(tabs)');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-900 px-6 py-12 justify-between">
      <View className="mt-12">
        <Text className="text-xxs font-extrabold uppercase tracking-widest text-teal-400">Step 3 of 3</Text>
        <Text className="text-2xl font-extrabold text-white mt-1">Emergency Contacts</Text>
        <Text className="text-sm text-slate-400 mt-2">
          {user?.role === 'caregiver'
            ? 'Set up contacts who should receive automatic SMS alerts if emergency fall events arise.'
            : 'Configure your primary caregiver or family member. They will be alerted instantly in a fall event.'}
        </Text>

        <View className="bg-slate-800/40 border border-slate-800 p-5 rounded-2xl mt-8">
          <View className="flex-row items-center mb-4">
            <HeartHandshake size={18} className="text-teal-400 mr-2" />
            <Text className="text-sm font-bold text-white uppercase tracking-wider">Primary Responder</Text>
          </View>

          <Input
            label="Full Name"
            placeholder="e.g. Sarah Thompson"
            value={name}
            onChangeText={setName}
          />

          <Input
            label="Phone Number"
            placeholder="e.g. +1 (555) 987-6543"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Input
            label="Relationship"
            placeholder="e.g. Daughter, Spouse, Doctor"
            value={relationship}
            onChangeText={setRelationship}
          />
        </View>
      </View>

      <View className="space-y-3 mb-6 mt-8">
        <Button
          title="Save Contact & Finish"
          onPress={handleSaveContact}
          isLoading={isLoading}
          variant="primary"
          size="lg"
          className="w-full font-bold"
        />

        <Button
          title={user?.role === 'caregiver' ? 'Skip (Add details later)' : 'Use Demo Contact'}
          onPress={handleSkip}
          variant="outline"
          size="md"
          className="w-full border-slate-800 text-white"
        />
      </View>
    </ScrollView>
  );
}
