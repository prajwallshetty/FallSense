import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Shield } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { useIncidentStore } from '../store/incidentStore';
import { useCaregiverStore } from '../store/caregiverStore';
import { endLocalSession, startSession, signOutEverywhere } from '../services/session';
import { notificationService } from '../services/notificationService';
import { canRoleOpen } from '../utils/routeAccess';
import { isOpen } from '../emergency/incidentMachine';
import { Button } from '../components/ui/Button';
import { colors, spacing, type } from '../theme';
import { installWebAlertPolyfill } from '../utils/webAlertPolyfill';

installWebAlertPolyfill();

function Splash({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <View style={styles.logo}>
        <Shield size={36} color={colors.primary} />
      </View>
      <Text style={type.title}>SafeFall AI</Text>
      <Text style={[type.body, { marginTop: spacing.sm }]}>{label}</Text>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxl }} />
    </View>
  );
}

function ProfileError({ message }: { message: string }) {
  return (
    <View style={[styles.center, { alignItems: 'stretch' }]}>
      <Text style={type.title}>Cannot load your account</Text>
      <Text style={[type.body, { marginVertical: spacing.lg }]}>{message}</Text>
      <Button title="Sign out" variant="outline" onPress={() => signOutEverywhere().catch(() => undefined)} />
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { status, profile, error, initialize, relations, authSource } = useAuthStore();
  const active = useIncidentStore((s) => s.active);
  const hydrated = useIncidentStore((s) => s.hydrated);

  useEffect(() => initialize(), [initialize]);

  // Start per-user services once the profile is known; stop them if the session ends.
  useEffect(() => {
    if (status === 'ready' && profile && authSource) startSession(profile, authSource).catch(() => undefined);
    if (status === 'signed_out') endLocalSession().catch(() => undefined);
  }, [status, profile, authSource]);

  // Caregivers: live alerts for every linked elderly user. Demo caregivers have no Firestore
  // credentials, so the subscription is skipped rather than left to fail and retry.
  useEffect(() => {
    if (status === 'ready' && authSource === 'firebase' && profile?.role === 'caregiver') {
      useCaregiverStore.getState().watch(relations.map((r) => r.elderlyId));
    }
  }, [status, authSource, profile?.role, relations]);

  // Caretakers: confirm received alerts and open the incident when one is tapped.
  useEffect(() => {
    if (authSource !== 'cloud' || profile?.role !== 'caregiver') return;
    return notificationService.listenForCaretakerAlerts((id) => router.push({ pathname: '/(app)/incident/[id]', params: { id } }));
  }, [authSource, profile?.role, router]);

  // Navigation guard.
  useEffect(() => {
    const parts = segments as string[];
    const group = parts[0];
    const route = parts[1];
    if (status === 'signed_out' && group !== '(auth)') router.replace('/(auth)/login');
    else if (status === 'signed_out' && route === 'complete-profile') router.replace('/(auth)/login');
    else if (status === 'needs_profile' && route !== 'complete-profile') router.replace('/(auth)/complete-profile');
    else if (status === 'ready' && profile) {
      if (!profile.onboardingComplete && group !== '(onboarding)') router.replace('/(onboarding)/welcome');
      else if (profile.onboardingComplete && (group === '(auth)' || group === '(onboarding)' || group === undefined)) {
        router.replace('/(app)/(tabs)');
      } else if (!canRoleOpen(profile.role, parts)) {
        // Blocks the other role's screens whether reached by navigation or a deep link.
        router.replace('/(app)/(tabs)');
      }
    }
  }, [status, profile, segments, router]);

  // Elderly users: an open incident always brings up the full-screen alert.
  const incidentOpen = !!active && isOpen(active.state) && profile?.role === 'elderly';
  useEffect(() => {
    if (status === 'ready' && hydrated && incidentOpen && segments[0] !== 'alert') router.push('/alert');
  }, [incidentOpen, status, hydrated, segments, router]);

  let overlay: React.ReactNode = null;
  // No Firebase-configuration wall here: a missing config leaves the login screen reachable
  // so demo mode still works. The login screen explains what real sign-in needs.
  if (status === 'initializing' || status === 'loading_profile') overlay = <Splash label={status === 'initializing' ? 'Starting…' : 'Loading your account…'} />;
  else if (status === 'error') overlay = <ProfileError message={error ?? 'Unknown error'} />;

  // The navigator always stays mounted (expo-router requirement); blocking states overlay it.
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="alert" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
        </Stack>
        {overlay ? <View style={StyleSheet.absoluteFill}>{overlay}</View> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.bg },
  logo: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
});
