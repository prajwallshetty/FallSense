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
import { PhoneCall, AlertTriangle, ShieldAlert, Footprints, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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

  const getInitials = (name?: string) => {
    if (!name) return 'SF';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Premium Header Greeting Card */}
      <LinearGradient
        colors={['#1E293B', '#0F172A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.userHeaderCard}
      >
        <View style={s.userHeaderContent}>
          <View style={s.avatarContainer}>
            <Text style={s.avatarText}>{getInitials(displayedUser?.fullName)}</Text>
          </View>
          <View style={s.userHeaderTextCol}>
            <Text style={s.headerLabel}>
              {isCaregiver ? '🛡️ MONITORING PATIENT' : '🛡️ SAFEFALL PROTECTION'}
            </Text>
            <Text style={s.headerTitle}>
              Hello, {displayedUser?.fullName.split(' ')[0]}!
            </Text>
          </View>
        </View>

        {isCaregiver && (
          <Pressable 
            onPress={() => router.push('/(app)/caregiver')}
            style={s.switchPatientBtn}
          >
            <Text style={s.switchPatientText}>Switch</Text>
            <ArrowRight size={10} color="#2DD4BF" style={{ marginLeft: 2 }} />
          </Pressable>
        )}
      </LinearGradient>

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

      {/* SOS Emergency Button */}
      <View style={s.mb4}>
        <Pressable onPress={handleQuickEmergencyTrigger}>
          <LinearGradient
            colors={['#EF4444', '#991B1B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.emergencyBtn}
          >
            <View style={s.row}>
              <View style={s.emergencyIconBg}>
                <PhoneCall size={22} color="#FFFFFF" />
              </View>
              <View>
                <Text style={s.emergencyTitle}>Trigger SOS</Text>
                <Text style={s.emergencySubtitle}>Alerts all active responders immediately</Text>
              </View>
            </View>
            <View style={s.emergencyArrow}>
              <ShieldAlert size={18} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Daily activity logs */}
      <Card style={s.mb4}>
        <Text style={s.activityTitle}>Daily Activity Summary</Text>
        
        <View style={s.activityRow}>
          <View style={s.row}>
            <View style={s.stepIconBg}>
              <Footprints size={18} color="#2DD4BF" />
            </View>
            <View>
              <Text style={s.activityLabel}>Step Counter</Text>
              <Text style={s.activityValue}>{currentSteps} / {stepsGoal}</Text>
            </View>
          </View>
          <View style={s.alignEnd}>
            <Text style={s.activityLabel}>Progress</Text>
            <Text style={s.activityPercent}>{progressPercent}% completed</Text>
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
        <Card style={s.simulatorCard}>
          <View style={s.simulatorHeader}>
            <AlertTriangle size={18} color="#F59E0B" style={s.mr2} />
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
  userHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  userHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#2DD4BF',
    fontSize: 16,
    fontWeight: '800',
  },
  userHeaderTextCol: {
    justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#94A3B8',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  switchPatientBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(45,212,191,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.15)',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchPatientText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2DD4BF',
    textTransform: 'uppercase',
  },
  ringCard: { 
    alignItems: 'center', 
    paddingVertical: 24, 
    marginBottom: 16,
    backgroundColor: 'rgba(30,41,59,0.3)',
  },
  ringRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  vitalsCol: { 
    gap: 12,
  },
  vitalLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  vitalStatus: { 
    fontSize: 18, 
    fontWeight: '900',
    marginTop: 2,
  },
  textEmerald: { color: '#10B981' },
  textSlate: { color: '#64748B' },
  vitalValue: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#E2E8F0',
    marginTop: 2,
  },
  mb4: { marginBottom: 16 },
  mr2: { marginRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  alignEnd: { alignItems: 'flex-end' },
  emergencyBtn: {
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  emergencyIconBg: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    marginRight: 14,
  },
  emergencyTitle: { 
    fontSize: 16, 
    fontWeight: '900', 
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  emergencySubtitle: { 
    fontSize: 11, 
    color: 'rgba(255,255,255,0.75)', 
    fontWeight: '600',
    marginTop: 1,
  },
  emergencyArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { 
    fontSize: 14, 
    fontWeight: '800', 
    color: '#FFFFFF', 
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stepIconBg: {
    padding: 8,
    backgroundColor: 'rgba(45,212,191,0.06)',
    borderRadius: 10,
    marginRight: 10,
  },
  activityLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityValue: { 
    fontSize: 15, 
    fontWeight: '800', 
    color: '#FFFFFF',
    marginTop: 2,
  },
  activityPercent: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: '#2DD4BF',
    marginTop: 2,
  },
  progressBg: {
    height: 6,
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
    borderTopColor: 'rgba(30,41,59,0.5)',
    paddingTop: 14,
  },
  metricItem: { alignItems: 'center', flex: 1 },
  metricItemBorder: {
    alignItems: 'center',
    flex: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(30,41,59,0.5)',
  },
  metricLabel: { fontSize: 11, color: '#64748B', marginBottom: 2 },
  metricValue: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  simulatorCard: {
    borderColor: 'rgba(245,158,11,0.2)',
    backgroundColor: 'rgba(245,158,11,0.03)',
    marginBottom: 24,
  },
  simulatorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  simulatorTitle: { fontSize: 14, fontWeight: '800', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5 },
  simulatorDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
    lineHeight: 16,
  },
});
