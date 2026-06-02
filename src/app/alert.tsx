import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAlertStore } from '../store/alertStore';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
import { Button } from '../components/ui/Button';
import { ShieldAlert, MapPin, BellRing } from 'lucide-react-native';

export default function AlertScreen() {
  const router = useRouter();
  const { activeAlert, countdown, cancelAlert, acknowledgeAlert } = useAlertStore();
  const { user } = useAuthStore();

  const flashAnim = useRef(new Animated.Value(0.15)).current;

  // 1. Setup siren audio and flashing visual animation on mount
  useEffect(() => {
    notificationService.startEmergencySiren();
    
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0.15,
          duration: 650,
          useNativeDriver: true,
        })
      ])
    );
    animation.start();

    return () => {
      notificationService.stopEmergencySiren();
      animation.stop();
    };
  }, [flashAnim]);

  // 2. React to alert removal
  useEffect(() => {
    if (!activeAlert) {
      router.replace('/(app)/(tabs)');
    }
  }, [activeAlert]);

  const handleCancelFalseAlarm = () => {
    Alert.alert(
      'Cancel Alarm',
      'Confirm this was a false alarm? The siren will silence and no dispatch will be sent.',
      [
        { text: 'Keep Alert Active', style: 'default' },
        { 
          text: 'Dismiss False Alarm', 
          style: 'destructive',
          onPress: () => {
            notificationService.stopEmergencySiren();
            cancelAlert();
          } 
        }
      ]
    );
  };

  const handleEscalateDispatch = () => {
    // Immediately escalate alerts to contacts
    if (user) {
      acknowledgeAlert(user.userId);
      Alert.alert('Dispatched!', 'Caregivers and responders have been successfully alerted.');
    }
  };

  if (!activeAlert) return null;

  return (
    <View style={styles.container}>
      
      {/* Red flashing overlay bg */}
      <Animated.View 
        style={[styles.flashingBg, { opacity: flashAnim }]}
      />

      {/* Top Banner Alert Info */}
      <View style={styles.topBanner}>
        <View style={styles.iconContainer}>
          <ShieldAlert size={44} color="#EF4444" />
        </View>
        <Text style={styles.bannerTitle}>
          {activeAlert.status === 'escalated' ? 'DISPATCH ACTIVE' : 'FALL DETECTED'}
        </Text>
        <Text style={styles.bannerSubtitle}>
          {activeAlert.status === 'escalated' ? 'Responders notified' : 'Checking client vitals'}
        </Text>
      </View>

      {/* Center Countdown or Status details */}
      <View style={styles.centerSection}>
        {activeAlert.status === 'pending' ? (
          <View style={styles.centerContent}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.countdownSubText}>
              seconds to auto-escalation
            </Text>
          </View>
        ) : (
          <View style={styles.statusBox}>
            <BellRing size={32} color="#F87171" style={styles.statusIcon} />
            <Text style={styles.statusTitle}>Emergency Broadcast Broadcasted</Text>
            <Text style={styles.statusSubText}>
              Caregivers and primary responders were notified with GPS telemetry data.
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* Patient Location and details card */}
      <View style={styles.patientCard}>
        <Text style={styles.patientLabel}>
          Patient Status
        </Text>
        
        <Text style={styles.patientName}>
          {activeAlert.userName}
        </Text>

        <View style={styles.locationRow}>
          <MapPin size={16} color="#EF4444" style={styles.locationIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressText}>
              {activeAlert.location.address || 'Address lookup pending...'}
            </Text>
            <Text style={styles.coordsText}>
              Lat: {activeAlert.location.latitude.toFixed(5)} | Lng: {activeAlert.location.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      </View>

      {/* Controls Action panel */}
      <View style={styles.actionPanel}>
        {activeAlert.status === 'pending' ? (
          <View style={styles.actionGroup}>
            <Button
              title="Cancel (False Alarm)"
              onPress={handleCancelFalseAlarm}
              variant="outline"
              size="lg"
              style={styles.cancelBtn}
            />
            
            <Button
              title="Dispatch Responders Now"
              onPress={handleEscalateDispatch}
              variant="danger"
              size="lg"
              style={styles.dispatchBtn}
            />
          </View>
        ) : (
          <Button
            title="Acknowledge & Close Screen"
            onPress={() => {
              notificationService.stopEmergencySiren();
              if (user) acknowledgeAlert(user.userId);
              router.replace('/(app)/(tabs)');
            }}
            variant="primary"
            size="lg"
            style={styles.ackBtn}
          />
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // slate-950
    paddingHorizontal: 24,
    paddingVertical: 56,
  },
  flashingBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#DC2626', // red-600
  },
  topBanner: {
    alignItems: 'center',
    marginTop: 40,
    zIndex: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.2)', // red-500/20
    borderWidth: 2,
    borderColor: '#EF4444', // red-500
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  bannerTitle: {
    fontSize: 30,
    fontWeight: '900', // black
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
  },
  bannerSubtitle: {
    fontSize: 14,
    fontWeight: '700', // bold
    color: '#FECACA', // red-200
    marginTop: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  centerSection: {
    alignItems: 'center',
    marginVertical: 24,
    zIndex: 10,
  },
  centerContent: {
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: '900', // black
    color: '#FFFFFF',
  },
  countdownSubText: {
    fontSize: 12,
    fontWeight: '700', // bold
    color: '#CBD5E1', // slate-300
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 8,
  },
  statusBox: {
    backgroundColor: 'rgba(239,68,68,0.2)', // red-500/20
    borderColor: 'rgba(239,68,68,0.3)', // red-500/30
    borderWidth: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  statusIcon: {
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700', // bold
    color: '#FFFFFF',
    textAlign: 'center',
  },
  statusSubText: {
    fontSize: 12,
    color: '#FECACA', // red-200
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  patientCard: {
    backgroundColor: 'rgba(15,23,42,0.9)', // slate-900/90
    borderColor: 'rgba(30,41,59,0.8)', // slate-800/80
    borderWidth: 1,
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    zIndex: 10,
  },
  patientLabel: {
    fontSize: 12,
    fontWeight: '700', // bold
    color: '#94A3B8', // slate-400
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '900', // black
    color: '#FFFFFF',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  locationIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  addressText: {
    fontSize: 12,
    color: '#CBD5E1', // slate-300
    lineHeight: 16,
  },
  coordsText: {
    fontSize: 10,
    color: '#64748B', // slate-500
    fontWeight: '700', // bold
    marginTop: 4,
    textTransform: 'uppercase',
  },
  actionPanel: {
    marginBottom: 16,
    zIndex: 10,
  },
  actionGroup: {
    gap: 12,
  },
  cancelBtn: {
    width: '100%',
    borderColor: '#334155', // slate-700
    backgroundColor: '#0F172A', // slate-900
    minHeight: 58,
  },
  dispatchBtn: {
    width: '100%',
    minHeight: 58,
  },
  ackBtn: {
    width: '100%',
    minHeight: 58,
  },
});
