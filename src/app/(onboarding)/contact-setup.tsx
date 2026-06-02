import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
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
    <ScrollView contentContainerStyle={s.scrollContent} style={s.scrollView}>
      <View style={s.topSection}>
        <Text style={s.stepLabel}>Step 3 of 3</Text>
        <Text style={s.headerTitle}>Emergency Contacts</Text>
        <Text style={s.headerSubtitle}>
          {user?.role === 'caregiver'
            ? 'Set up contacts who should receive automatic SMS alerts if emergency fall events arise.'
            : 'Configure your primary caregiver or family member. They will be alerted instantly in a fall event.'}
        </Text>

        <View style={s.formContainer}>
          <View style={s.formHeader}>
            <HeartHandshake size={18} color="#2DD4BF" style={s.mr2} />
            <Text style={s.formTitle}>Primary Responder</Text>
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

      <View style={s.bottomSection}>
        <Button
          title="Save Contact & Finish"
          onPress={handleSaveContact}
          isLoading={isLoading}
          variant="primary"
          size="lg"
          style={s.fullWidth}
        />

        <Button
          title={user?.role === 'caregiver' ? 'Skip (Add details later)' : 'Use Demo Contact'}
          onPress={handleSkip}
          variant="outline"
          size="md"
          style={s.skipBtn}
        />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  topSection: { marginTop: 48 },
  stepLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#2DD4BF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: 'rgba(30,41,59,0.4)',
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    marginTop: 32,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mr2: { marginRight: 8 },
  bottomSection: {
    gap: 12,
    marginBottom: 24,
    marginTop: 32,
  },
  fullWidth: { width: '100%' },
  skipBtn: {
    width: '100%',
    borderColor: '#1E293B',
  },
});
