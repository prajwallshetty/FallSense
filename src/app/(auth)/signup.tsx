import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-900 px-6 justify-center">
      {/* Back button */}
      <Pressable 
        onPress={() => router.back()} 
        className="flex-row items-center mt-12 mb-4 self-start"
      >
        <ChevronLeft size={20} className="text-slate-400 mr-1" />
        <Text className="text-sm font-semibold text-slate-400">Back to Login</Text>
      </Pressable>

      <View className="mb-6">
        <Text className="text-2xl font-extrabold text-white">Create Account</Text>
        <Text className="text-sm text-slate-400 mt-1">Get started with elder fall monitoring</Text>
      </View>

      {/* Account Type Selector */}
      <Text className="text-sm font-semibold text-slate-400 mb-2 ml-1">Select Account Type</Text>
      <View className="flex-row gap-3 mb-5">
        <Pressable
          onPress={() => setRole('elderly')}
          className={`flex-1 p-4 rounded-2xl border flex-row items-center justify-center ${
            role === 'elderly' 
              ? 'bg-teal-600/10 border-teal-500' 
              : 'bg-slate-800/40 border-slate-700/30'
          }`}
        >
          <User size={18} className={role === 'elderly' ? 'text-teal-400' : 'text-slate-400'} />
          <Text className={`text-sm font-bold ml-2 ${role === 'elderly' ? 'text-teal-400' : 'text-slate-400'}`}>
            Elderly User
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setRole('caregiver')}
          className={`flex-1 p-4 rounded-2xl border flex-row items-center justify-center ${
            role === 'caregiver' 
              ? 'bg-teal-600/10 border-teal-500' 
              : 'bg-slate-800/40 border-slate-700/30'
          }`}
        >
          <Users size={18} className={role === 'caregiver' ? 'text-teal-400' : 'text-slate-400'} />
          <Text className={`text-sm font-bold ml-2 ${role === 'caregiver' ? 'text-teal-400' : 'text-slate-400'}`}>
            Caregiver
          </Text>
        </Pressable>
      </View>

      {/* Registration Details */}
      <View className="bg-slate-800/40 border border-slate-700/30 p-6 rounded-3xl mb-8">
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
          className="w-full mt-2"
        />
      </View>
    </ScrollView>
  );
}
