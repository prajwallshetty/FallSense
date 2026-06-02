import React from 'react';
import { View, Text, ScrollView, Alert, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useDeviceStore } from '../../../store/deviceStore';
import { bleService } from '../../../services/bleService';
import { BatteryRing } from '../../../components/Dashboard/BatteryRing';
import { LiveStatusCard } from '../../../components/Dashboard/LiveStatusCard';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { PhoneCall, AlertTriangle, Flame, ShieldAlert, Footprints, Clock, ArrowRight } from 'lucide-react-native';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, activeElderlyProfile } = useAuthStore();
  const { pairedDevice, isConnected, isSimulatorMode } = useDeviceStore();

  const isCaregiver = user?.role === 'caregiver';
  const displayedUser = isCaregiver ? (activeElderlyProfile || user) : user;

  const stepsGoal = 8000;
  const currentSteps = 3450; // mock data
  const progressPercent = Math.min(100, Math.round((currentSteps / stepsGoal) * 100));

  // Quick emergency dispatcher
  const handleQuickEmergencyTrigger = () => {
    Alert.alert(
      'ALERT DISPATCH',
      'Are you sure you want to trigger an immediate Emergency Broadcast to all contacts?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'EMERGENCY', 
          style: 'destructive',
          onPress: () => {
            // Trigger emergency fall sequence directly
            bleService.simulateFallEvent();
          } 
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* User Header */}
      <View style={s.titleRow}>
        <View>
          <Text style={s.headerLabel}>
            {isCaregiver ? 'Monitoring Patient' : 'SafeFall Protection'}
          </Text>
          <Text style={s.headerTitle}>
            Hello, {displayedUser?.fullName.split(' ')[0]}!
          </Text>
        </View>

        {isCaregiver && (
          <Pressable 
            onPress={() => router.push('/(app)/caregiver')}
            style={s.switchPatientBtn}
          >
            <Text style={s.switchPatientText}>Switch Patient</Text>
            <ArrowRight size={12} color="#0D9488" />
          </Pressable>
        )}
      </View>

      {/* Main Devices Ring and Connectivity Status */}
      <Card style={s.ringCard}>
        <View style={s.ringRow}>
          {/* Battery ring */}
          <BatteryRing percentage={pairedDevice && isConnected ? pairedDevice.batteryLevel : 0} />
          
          {/* Vitals Summary Column */}
          <View style={s.vitalsCol}>
            <View>
              <Text style={s.vitalLabel}>Fall Monitor</Text>
              <Text style={[s.vitalStatus, isConnected ? s.textEmerald : s.textSlate]}>
                {isConnected ? 'SENSING LIVE' : 'OFFLINE'}
              </Text>
            </View>
            <View>
              <Text style={s.vitalLabel}>Last Sync Time</Text>
              <Text style={s.vitalValue}>
                {pairedDevice && isConnected ? 'Just now' : 'Yesterday'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Live BLE status panel */}
      <LiveStatusCard />

      {/* Emergency dispatch alert action targets */}
      <View style={s.mb4}>
        <Pressable
          onPress={handleQuickEmergencyTrigger}
          style={s.emergencyBtn}
        >
          <View style={s.row}>
            <View style={s.emergencyIconBg}>
              <PhoneCall size={28} color="#FFFFFF" />
            </View>
            <View>
              <Text style={s.emergencyTitle}>Emergency Call</Text>
              <Text style={s.emergencySubtitle}>Alerts priority caregivers immediately</Text>
            </View>
          </View>
          <View style={s.emergencyArrow}>
            <ShieldAlert size={20} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>

      {/* Daily activity logs */}
      <Card style={s.mb4}>
        <Text style={s.activityTitle}>Daily Activity Summary</Text>
        
        <View style={s.activityRow}>
          <View style={s.row}>
            <View style={s.stepIconBg}>
              <Footprints size={20} color="#0D9488" />
            </View>
            <View>
              <Text style={s.activityLabel}>Step Counter</Text>
              <Text style={s.activityValue}>{currentSteps} / {stepsGoal}</Text>
            </View>
          </View>
          <View style={s.alignEnd}>
            <Text style={s.activityLabel}>Target</Text>
            <Text style={s.activityPercent}>{progressPercent}% done</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: `${progressPercent}%` }]} />
        </View>

        <View style={s.metricsRow}>
          <View style={s.metricItem}>
            <Text style={s.metricLabel}>Active Time</Text>
            <Text style={s.metricValue}>24 min</Text>
          </View>
          <View style={s.metricItemBorder}>
            <Text style={s.metricLabel}>Calories</Text>
            <Text style={s.metricValue}>180 kcal</Text>
          </View>
          <View style={s.metricItem}>
            <Text style={s.metricLabel}>Vitals Level</Text>
            <Text style={s.metricValue}>Normal</Text>
          </View>
        </View>
      </Card>

      {/* Simulator Tools Controls panel if Developer Sandbox */}
      {isSimulatorMode && isConnected && (
        <Card style={s.simulatorCard} accentBorder>
          <View style={s.simulatorHeader}>
            <AlertTriangle size={18} color="#0D9488" style={s.mr2} />
            <Text style={s.simulatorTitle}>Simulator Sandbox Tools</Text>
          </View>
          <Text style={s.simulatorDesc}>
            Simulate a high-impact fall vector (accelerometer spikes) from the ESP32 smartwatch. This will launch the global alert modal.
          </Text>
          <Button
            title="Simulate Smartwatch Fall Alert"
            onPress={() => bleService.simulateFallEvent()}
            variant="danger"
            size="md"
          />
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#64748B',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  switchPatientBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.2)',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchPatientText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
    textTransform: 'uppercase',
    marginRight: 4,
  },
  ringCard: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  ringRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  vitalsCol: { gap: 8 },
  vitalLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#64748B',
  },
  vitalStatus: { fontSize: 16, fontWeight: '800' },
  textEmerald: { color: '#10B981' },
  textSlate: { color: '#94A3B8' },
  vitalValue: { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
  mb4: { marginBottom: 16 },
  mr2: { marginRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  alignEnd: { alignItems: 'flex-end' },
  emergencyBtn: {
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emergencyIconBg: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    marginRight: 16,
  },
  emergencyTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  emergencySubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  emergencyArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 16 },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepIconBg: {
    padding: 10,
    backgroundColor: 'rgba(13,148,136,0.05)',
    borderRadius: 12,
    marginRight: 12,
  },
  activityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  activityValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  activityPercent: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  progressBg: {
    height: 8,
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0D9488',
    borderRadius: 999,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.8)',
    paddingTop: 16,
  },
  metricItem: { alignItems: 'center', flex: 1 },
  metricItemBorder: {
    alignItems: 'center',
    flex: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(30,41,59,0.8)',
  },
  metricLabel: { fontSize: 12, color: '#64748B', marginBottom: 2 },
  metricValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  simulatorCard: {
    borderColor: 'rgba(13,148,136,0.2)',
    backgroundColor: 'rgba(13,148,136,0.05)',
    marginBottom: 24,
  },
  simulatorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  simulatorTitle: { fontSize: 14, fontWeight: '700', color: '#0D9488' },
  simulatorDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
    lineHeight: 16,
  },
});
