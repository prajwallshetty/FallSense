import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
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
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      {/* Back link */}
      <Pressable 
        onPress={() => router.back()} 
        style={styles.backButton}
      >
        <ChevronLeft size={20} color="#94A3B8" style={{ marginRight: 4 }} />
        <Text style={styles.backButtonText}>Back to Login</Text>
      </Pressable>

      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Key size={40} color="#2DD4BF" />
        </View>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <Text style={styles.headerSubtitle}>
          Enter your email to receive recovery instructions.
        </Text>
      </View>

      {!isSent ? (
        <View style={styles.formContainer}>
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
            style={styles.submitBtn}
          />
        </View>
      ) : (
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>Instructions Sent!</Text>
          <Text style={styles.successText}>
            We have emailed a secure link to reset your password. Please check your spam folder if you do not receive it in a few minutes.
          </Text>
          <Button
            title="Return to Login"
            onPress={() => router.replace('/(auth)/login')}
            variant="primary"
            size="md"
            style={{ width: '100%' }}
          />
        </View>
      )}
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
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    padding: 16,
    backgroundColor: 'rgba(20,184,166,0.1)', // teal-500/10
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.2)', // teal-500/20
    marginBottom: 16,
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
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  formContainer: {
    backgroundColor: 'rgba(30,41,59,0.4)', // slate-800/40
    borderColor: 'rgba(51,65,85,0.3)', // slate-700/30
    borderWidth: 1,
    padding: 24,
    borderRadius: 24,
    marginBottom: 48,
  },
  submitBtn: {
    width: '100%',
    marginTop: 8,
  },
  successContainer: {
    backgroundColor: 'rgba(2,44,34,0.2)', // emerald-950/20
    borderColor: 'rgba(6,78,59,0.5)', // emerald-900/50
    borderWidth: 1,
    padding: 24,
    borderRadius: 24,
    marginBottom: 48,
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#34D399', // emerald-400
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#CBD5E1', // slate-300
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});
