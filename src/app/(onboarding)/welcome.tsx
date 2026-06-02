import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Heart, Shield, Radio, ChevronRight } from 'lucide-react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isCaregiver = user?.role === 'caregiver';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      {/* Top Banner */}
      <View style={styles.topBanner}>
        <Heart size={48} color="#2DD4BF" />
        <Text style={styles.title}>
          Welcome to SafeFall AI
        </Text>
        <Text style={styles.subtitle}>
          Hello {user?.fullName || 'User'}, let's complete a quick 3-step setup to activate real-time fall detection monitoring.
        </Text>
      </View>

      {/* Highlights List */}
      <View style={styles.highlightsContainer}>
        {/* Core Protection */}
        <View style={styles.highlightCard}>
          <View style={styles.iconContainer}>
            <Shield size={24} color="#2DD4BF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.highlightTitle}>
              {isCaregiver ? 'Continuous Elderly Tracking' : 'Automatic Fall Sensing'}
            </Text>
            <Text style={styles.highlightText}>
              {isCaregiver 
                ? 'Get notified immediately if an elderly parent falls, with full telemetry log context and battery alerts.' 
                : 'Your paired smartwatch reads acceleration forces. If a sudden impact occurs, the system starts a countdown.'}
            </Text>
          </View>
        </View>

        {/* GPS Tracking */}
        <View style={styles.highlightCard}>
          <View style={styles.iconContainer}>
            <Radio size={24} color="#2DD4BF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.highlightTitle}>
              Active Geolocation Dispatch
            </Text>
            <Text style={styles.highlightText}>
              If a fall occurs, the exact GPS coordinates and matching street address are shared instantly with caregivers and emergency services.
            </Text>
          </View>
        </View>
      </View>

      {/* Call to Action */}
      <View style={styles.ctaContainer}>
        <Button
          title="Configure System Permissions"
          onPress={() => router.replace('/(onboarding)/permissions')}
          variant="primary"
          size="lg"
          style={styles.ctaButton}
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
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  topBanner: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800', // extrabold
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8', // slate-400
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  highlightsContainer: {
    marginVertical: 32,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(30,41,59,0.4)', // slate-800/40
    borderColor: '#1E293B', // slate-800
    borderWidth: 1,
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  iconContainer: {
    padding: 10,
    backgroundColor: 'rgba(20,184,166,0.1)', // teal-500/10
    borderRadius: 12,
    marginRight: 14,
  },
  highlightTitle: {
    fontSize: 16,
    fontWeight: '700', // bold
    color: '#FFFFFF',
    marginBottom: 4,
  },
  highlightText: {
    fontSize: 12,
    color: '#94A3B8', // slate-400
    lineHeight: 18,
  },
  ctaContainer: {
    marginBottom: 24,
  },
  ctaButton: {
    width: '100%',
    justifyContent: 'center',
  },
});
