import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { firebaseService } from '../../services/firebase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ChevronLeft, Key } from 'lucide-react-native';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email) {
      setError('Please input your registered email address.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await firebaseService.sendPasswordResetEmail(email);
      setIsSent(true);
    } catch (err) {
      Alert.alert('Reset Failed', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-900 px-6 justify-center">
      {/* Back link */}
      <Pressable 
        onPress={() => router.back()} 
        className="flex-row items-center mt-12 mb-4 self-start"
      >
        <ChevronLeft size={20} className="text-slate-400 mr-1" />
        <Text className="text-sm font-semibold text-slate-400">Back to Login</Text>
      </Pressable>

      <View className="items-center mb-8">
        <View className="p-4 bg-teal-500/10 rounded-3xl border border-teal-500/20 mb-4">
          <Key size={40} className="text-teal-400" />
        </View>
        <Text className="text-2xl font-extrabold text-white">Reset Password</Text>
        <Text className="text-sm text-slate-400 mt-1 text-center px-6">
          Enter your email to receive recovery instructions.
        </Text>
      </View>

      {!isSent ? (
        <View className="bg-slate-800/40 border border-slate-700/30 p-6 rounded-3xl mb-12">
          <Input
            label="Registered Email"
            placeholder="yourname@gmail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={error}
          />

          <Button
            title="Send Reset Instructions"
            onPress={handleReset}
            isLoading={isLoading}
            variant="primary"
            size="lg"
            className="w-full mt-2"
          />
        </View>
      ) : (
        <View className="bg-emerald-950/20 border border-emerald-900/50 p-6 rounded-3xl mb-12 items-center">
          <Text className="text-base font-bold text-emerald-400 mb-2">Instructions Sent!</Text>
          <Text className="text-sm text-slate-300 text-center leading-5 mb-6">
            We have emailed a secure link to reset your password. Please check your spam folder if you do not receive it in a few minutes.
          </Text>
          <Button
            title="Return to Login"
            onPress={() => router.replace('/(auth)/login')}
            variant="primary"
            size="md"
            className="w-full"
          />
        </View>
      )}
    </ScrollView>
  );
}
