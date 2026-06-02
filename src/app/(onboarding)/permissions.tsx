import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { locationService } from '../../services/locationService';
import { notificationService } from '../../services/notificationService';
import { Bluetooth, MapPin, Bell, CheckCircle2 } from 'lucide-react-native';

export default function PermissionsScreen() {
  const router = useRouter();

  const [bleStatus, setBleStatus] = useState<'prompt' | 'granted'>('prompt');
  const [gpsStatus, setGpsStatus] = useState<'prompt' | 'granted'>('prompt');
  const [pushStatus, setPushStatus] = useState<'prompt' | 'granted'>('prompt');

  const requestBluetooth = async () => {
    // Simulated Bluetooth authorization
    setBleStatus('granted');
  };

  const requestLocation = async () => {
    const granted = await locationService.requestPermissions();
    if (granted) {
      setGpsStatus('granted');
    } else {
      Alert.alert('Permission Denied', 'SafeFall AI requires location access to transmit correct coordinates in emergencies.');
    }
  };

  const requestNotifications = async () => {
    const granted = await notificationService.requestPermissions();
    if (granted) {
      setPushStatus('granted');
    } else {
      Alert.alert('Permission Denied', 'Enable push notifications to receive real-time fall warnings.');
    }
  };

  const handleNext = () => {
    if (gpsStatus !== 'granted') {
      Alert.alert('Location Required', 'Please authorize Location access before proceeding to ensure safety tracking.');
      return;
    }
    router.replace('/(onboarding)/contact-setup');
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepText}>Step 2 of 3</Text>
        <Text style={styles.titleText}>Authorize Permissions</Text>
        <Text style={styles.subtitleText}>
          We require these services to coordinate hardware connections and emergency dispatches.
        </Text>

        <View style={styles.permissionsContainer}>
          
          {/* Bluetooth permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionInfo}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                <Bluetooth size={22} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>Bluetooth Connectivity</Text>
                <Text style={styles.permissionDesc}>Pair and synchronise fall alerts from ESP32 smartwatch.</Text>
              </View>
            </View>
            {bleStatus === 'granted' ? (
              <CheckCircle2 size={24} color="#34D399" />
            ) : (
              <Button title="Enable" onPress={requestBluetooth} variant="outline" size="sm" style={styles.enableBtn} />
            )}
          </View>

          {/* Location permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionInfo}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(20,184,166,0.1)' }]}>
                <MapPin size={22} color="#2DD4BF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>GPS Location Dispatch</Text>
                <Text style={styles.permissionDesc}>Identifies exact coordinates when a fall is detected.</Text>
              </View>
            </View>
            {gpsStatus === 'granted' ? (
              <CheckCircle2 size={24} color="#34D399" />
            ) : (
              <Button title="Enable" onPress={requestLocation} variant="outline" size="sm" style={styles.enableBtn} />
            )}
          </View>

          {/* Notifications permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionInfo}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                <Bell size={22} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>Push Notifications</Text>
                <Text style={styles.permissionDesc}>Receive crucial alert updates & watch offline notifications.</Text>
              </View>
            </View>
            {pushStatus === 'granted' ? (
              <CheckCircle2 size={24} color="#34D399" />
            ) : (
              <Button title="Enable" onPress={requestNotifications} variant="outline" size="sm" style={styles.enableBtn} />
            )}
          </View>

        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title="Continue to Contacts Setup"
          onPress={handleNext}
          variant="primary"
          size="lg"
          style={{ width: '100%' }}
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
  header: {
    marginTop: 48,
  },
  stepText: {
    fontSize: 10,
    fontWeight: '800', // extrabold
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#2DD4BF', // teal-400
  },
  titleText: {
    fontSize: 24,
    fontWeight: '800', // extrabold
    color: '#FFFFFF',
    marginTop: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: '#94A3B8', // slate-400
    marginTop: 8,
  },
  permissionsContainer: {
    marginTop: 32,
    gap: 16,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30,41,59,0.4)', // slate-800/40
    borderColor: '#1E293B', // slate-800
    borderWidth: 1,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  permissionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 16,
  },
  iconContainer: {
    padding: 10,
    borderRadius: 12,
    marginRight: 14,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '700', // bold
    color: '#FFFFFF',
    marginBottom: 2,
  },
  permissionDesc: {
    fontSize: 12,
    color: '#94A3B8', // slate-400
    lineHeight: 16,
  },
  enableBtn: {
    borderColor: '#334155', // slate-700
  },
  footer: {
    marginBottom: 24,
  },
});
