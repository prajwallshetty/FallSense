import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { User, Users, ChevronLeft } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

export default function SignupScreen() {
  const router = useRouter();
  const setUser = useAuthStore(state => state.setUser);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'elderly' | 'caregiver'>('elderly');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!fullName) newErrors.fullName = 'Full Name is required.';
    if (!email) newErrors.email = 'Email address is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address format.';
    if (!phone) newErrors.phone = 'Phone number is required.';
    if (!password) newErrors.password = 'Password is required.';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters.';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const profile = await firebaseService.signup(email, role, fullName, phone, password);
      await SecureStore.setItemAsync('user_session', JSON.stringify(profile));
      setUser(profile);
      router.replace('/(onboarding)/welcome');
    } catch (err) {
      Alert.alert('Registration Failed', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      {/* Back button */}
      <Pressable 
        onPress={() => router.back()} 
        style={styles.backButton}
      >
        <ChevronLeft size={20} color="#94A3B8" style={{ marginRight: 4 }} />
        <Text style={styles.backButtonText}>Back to Login</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create Account</Text>
        <Text style={styles.headerSubtitle}>Get started with elder fall monitoring</Text>
      </View>

      {/* Account Type Selector */}
      <Text style={styles.sectionLabel}>Select Account Type</Text>
      <View style={styles.roleContainer}>
        <Pressable
          onPress={() => setRole('elderly')}
          style={[
            styles.roleBox,
            role === 'elderly' ? styles.roleBoxActive : styles.roleBoxInactive
          ]}
        >
          <User size={18} color={role === 'elderly' ? '#2DD4BF' : '#94A3B8'} />
          <Text style={[
            styles.roleText,
            role === 'elderly' ? styles.roleTextActive : styles.roleTextInactive
          ]}>
            Elderly User
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setRole('caregiver')}
          style={[
            styles.roleBox,
            role === 'caregiver' ? styles.roleBoxActive : styles.roleBoxInactive
          ]}
        >
          <Users size={18} color={role === 'caregiver' ? '#2DD4BF' : '#94A3B8'} />
          <Text style={[
            styles.roleText,
            role === 'caregiver' ? styles.roleTextActive : styles.roleTextInactive
          ]}>
            Caregiver
          </Text>
        </Pressable>
      </View>

      {/* Registration Details */}
      <View style={styles.formContainer}>
        <Input
          label="Full Name"
          placeholder="e.g. Margaret Thompson"
          value={fullName}
          onChangeText={setFullName}
          error={errors.fullName}
        />

        <Input
          label="Email Address"
          placeholder="yourname@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
        />

        <Input
          label="Phone Number"
          placeholder="+1 (555) 123-4567"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
        />

        <Input
          label="Password"
          placeholder="Min. 6 characters"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
        />

        <Button
          title="Create Account"
          onPress={handleSignup}
          isLoading={isLoading}
          variant="primary"
          size="lg"
          style={styles.submitBtn}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A', // slate-900
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingVertical: 48,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8', // slate-400
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8', // slate-400
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    marginLeft: 4,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  roleBox: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBoxActive: {
    backgroundColor: 'rgba(13,148,136,0.1)', // teal-600/10
    borderColor: '#14B8A6', // teal-500
  },
  roleBoxInactive: {
    backgroundColor: 'rgba(30,41,59,0.4)', // slate-800/40
    borderColor: 'rgba(51,65,85,0.3)', // slate-700/30
  },
  roleText: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  roleTextActive: {
    color: '#2DD4BF', // teal-400
  },
  roleTextInactive: {
    color: '#94A3B8', // slate-400
  },
  formContainer: {
    backgroundColor: 'rgba(30,41,59,0.4)', // slate-800/40
    borderColor: 'rgba(51,65,85,0.3)', // slate-700/30
    borderWidth: 1,
    padding: 24,
    borderRadius: 24,
    marginBottom: 32,
  },
  submitBtn: {
    width: '100%',
    marginTop: 8,
  },
});
