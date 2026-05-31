import React, { useEffect } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useAlertStore } from '../store/alertStore';
import { useDeviceStore } from '../store/deviceStore';
import { notificationService } from '../services/notificationService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();

  const { isAuthenticated, isLoading, initializeSession } = useAuthStore();
  const { activeAlert } = useAlertStore();
  const { initializeDevice } = useDeviceStore();

  // 1. Initialise core sessions on mount
  useEffect(() => {
    initializeSession();
    initializeDevice();
  }, []);

  // 2. Auth State Redirect Guard
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = pathname.startsWith('/(auth)');

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login' as any);
      }
    } else {
      if (inAuthGroup) {
        router.replace('/(onboarding)/welcome' as any);
      }
    }
  }, [isAuthenticated, isLoading, pathname]);

  // 3. Fall Alert Interceptor
  useEffect(() => {
    if (activeAlert && (activeAlert.status === 'pending' || activeAlert.status === 'escalated')) {
      if (pathname !== '/alert') {
        router.push('/alert' as any);
        notificationService.startEmergencySiren();
      }
    } else {
      notificationService.stopEmergencySiren();
    }
  }, [activeAlert, pathname]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.loadingTitle}>SafeFall AI</Text>
        <Text style={styles.loadingSubtitle}>Loading secure parameters...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colorScheme === 'dark' ? '#0F172A' : '#F8FAFC' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="alert" 
          options={{ 
            headerShown: false, 
            presentation: 'fullScreenModal',
            animation: 'fade'
          }} 
        />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  loadingTitle: {
    color: '#0D9488',
    fontWeight: 'bold',
    fontSize: 22,
    marginTop: 16,
  },
  loadingSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 8,
  },
});
