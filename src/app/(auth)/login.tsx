import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import * as SecureStore from 'expo-secure-store';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore(state => state.setUser);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = 'Email address is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address format.';
    if (!password) newErrors.password = 'Password is required.';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const profile = await firebaseService.login(email, password);
      await SecureStore.setItemAsync('user_session', JSON.stringify(profile));
      setUser(profile);
      router.replace('/(onboarding)/welcome' as any);
    } catch (err) {
      Alert.alert('Login Failed', (err as Error).message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async (role: 'elderly' | 'caregiver') => {
    setIsLoading(true);
    const demoEmail = role === 'caregiver' ? 'caregiver@safefall.ai' : 'elderly@safefall.ai';
    try {
      const profile = await firebaseService.login(demoEmail, 'password123');
      await SecureStore.setItemAsync('user_session', JSON.stringify(profile));
      setUser(profile);
      router.replace('/(onboarding)/welcome' as any);
    } catch (err) {
      Alert.alert('Demo Login Error', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={styles.container}>
      {/* Brand Header */}
      <View style={styles.headerContainer}>
        <View style={styles.iconCircle}>
          <Text style={styles.heartIcon}>♥</Text>
        </View>
        <Text style={styles.brandTitle}>SafeFall AI</Text>
        <Text style={styles.brandSubtitle}>
          Advanced wearable fall-detection and elder protection portal.
        </Text>
      </View>

      {/* Login Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={[styles.input, errors.email ? styles.inputError : null]}
          placeholder="yourname@gmail.com"
          placeholderTextColor="#94A3B8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, errors.password ? styles.inputError : null]}
          placeholder="••••••"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

        <Pressable onPress={() => router.push('/(auth)/forgot-password' as any)}>
          <Text style={styles.forgotLink}>Forgot Password?</Text>
        </Pressable>

        <Pressable style={[styles.btnPrimary, isLoading && styles.btnDisabled]} onPress={handleLogin} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Sign In</Text>}
        </Pressable>

        <Pressable
          style={styles.btnOutline}
          onPress={() => Alert.alert('Google Auth', 'In production, this hooks into Google Sign In OAuth client.')}
        >
          <Text style={styles.btnOutlineText}>Continue with Google</Text>
        </Pressable>
      </View>

      {/* Quick Demo Panel */}
      <View style={styles.demoPanel}>
        <Text style={styles.demoTitle}>⚡ Developer Testing Sandbox</Text>
        <View style={styles.demoRow}>
          <Pressable style={styles.demoBtn} onPress={() => handleQuickDemoLogin('elderly')}>
            <Text style={styles.demoBtnText}>👤 Elderly Profile</Text>
          </Pressable>
          <Pressable style={styles.demoBtn} onPress={() => handleQuickDemoLogin('caregiver')}>
            <Text style={styles.demoBtnText}>👥 Caregiver Profile</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account?</Text>
        <Pressable onPress={() => router.push('/(auth)/signup' as any)}>
          <Text style={styles.footerLink}> Create Account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingHorizontal: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 32, marginTop: 60 },
  iconCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(13,148,136,0.1)', borderWidth: 1, borderColor: 'rgba(13,148,136,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heartIcon: { fontSize: 36, color: '#2DD4BF' },
  brandTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  brandSubtitle: { fontSize: 14, color: '#94A3B8', marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  card: { backgroundColor: 'rgba(30,41,59,0.4)', borderWidth: 1, borderColor: 'rgba(51,65,85,0.3)', padding: 24, borderRadius: 24, marginBottom: 24 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginBottom: 6, marginLeft: 4 },
  input: { width: '100%', backgroundColor: '#020617', color: '#FFFFFF', borderWidth: 1, borderColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, fontSize: 16, marginBottom: 16 },
  inputError: { borderColor: '#EF4444' },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: -12, marginBottom: 12, marginLeft: 4 },
  forgotLink: { fontSize: 12, fontWeight: '600', color: '#2DD4BF', textAlign: 'right', marginBottom: 20 },
  btnPrimary: { backgroundColor: '#0D9488', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 52 },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: '#334155', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  btnOutlineText: { color: '#E2E8F0', fontSize: 16, fontWeight: '600' },
  demoPanel: { backgroundColor: 'rgba(30,41,59,0.2)', borderWidth: 1, borderColor: '#1E293B', padding: 20, borderRadius: 16, marginBottom: 32 },
  demoTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  demoRow: { flexDirection: 'row', gap: 12 },
  demoBtn: { flex: 1, backgroundColor: '#1E293B', borderWidth: 1, borderColor: 'rgba(51,65,85,0.5)', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  demoBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  footerText: { color: '#94A3B8', fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '700', color: '#2DD4BF' },
});
