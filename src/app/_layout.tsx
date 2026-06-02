import React, { useEffect } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useAlertStore } from '../store/alertStore';
import { useDeviceStore } from '../store/deviceStore';
import { notificationService } from '../services/notificationService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield } from 'lucide-react-native';

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
      <LinearGradient
        colors={['#020617', '#0F172A', '#020617']}
        style={styles.loadingContainer}
      >
        <View style={styles.logoBadge}>
          <Shield size={32} color="#2DD4BF" />
        </View>
        <Text style={styles.loadingTitle}>SafeFall AI</Text>
        <Text style={styles.loadingSubtitle}>Securing bio-telemetry stream...</Text>
        <ActivityIndicator size="small" color="#0D9488" style={styles.spinner} />
      </LinearGradient>
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
    paddingHorizontal: 32,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(13, 148, 136, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  loadingSubtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  spinner: {
    marginTop: 32,
  },
});
