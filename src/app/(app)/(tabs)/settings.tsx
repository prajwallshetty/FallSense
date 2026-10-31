import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Activity, BatteryCharging, Bluetooth, ChevronRight, FlaskConical, Info, LogOut, MapPin, Phone, ShieldCheck, SlidersHorizontal, User, Users, Wifi } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { signOutEverywhere, unsyncedIncidentCount } from '../../../services/session';
import { watchApiService } from '../../../services/watchApiService';
import { env } from '../../../config/env';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { colors, spacing, TOUCH_MIN, type } from '../../../theme';

function Row({ icon, label, detail, onPress }: { icon: React.ReactNode; label: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={detail ? `${label}. ${detail}` : label} style={({ pressed }) => [styles.row, pressed ? { opacity: 0.7 } : null]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <ChevronRight size={24} color={colors.textSubtle} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, relations, authSource, isDemo, calibrationAccess } = useAuthStore();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const isElderly = profile.role === 'elderly';
  const icon = (I: typeof User) => <I size={26} color={colors.primary} />;

  const signOut = () => {
    const pending = unsyncedIncidentCount();
    Alert.alert(
      'Sign out?',
      pending > 0
        ? `${pending} alert${pending === 1 ? ' has' : 's have'} not reached the server yet. Signing out now may lose ${pending === 1 ? 'it' : 'them'}. Connect to the internet first if you can.`
        : isElderly
          ? 'Monitoring stops and fall alerts will not work until you sign in again.'
          : 'This phone will stop receiving alerts.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await signOutEverywhere();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen title="Settings" inTabs>
      <Card onPress={authSource === 'firebase' ? () => router.push('/(app)/profile') : undefined} accessibilityLabel={profile.fullName}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View style={styles.avatar}>
            <User size={30} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.heading}>{profile.fullName}</Text>
            <Text style={styles.detail}>{isElderly ? 'Watch wearer' : 'Caretaker'}{isDemo ? ' · Demo mode' : ''}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ paddingVertical: spacing.sm }}>
        {isElderly ? (
          <>
            <Row icon={icon(Wifi)} label="Your watch" detail="Connection, diagnostics and settings" onPress={() => router.push('/(app)/watch')} />
            <Row icon={icon(Activity)} label="Detection insights" detail="What the detector sees" onPress={() => router.push('/(app)/insights')} />
            <Row icon={icon(Phone)} label="Emergency contacts" detail="People you can call or text from an alert" onPress={() => router.push('/(app)/contacts')} />
          </>
        ) : null}
        <Row
          icon={icon(Users)}
          label={isElderly ? 'Caretakers' : 'People I care for'}
          detail={relations.length ? relations.map((r) => (isElderly ? r.caregiverName : r.elderlyName)).join(', ') : 'Nobody linked yet'}
          onPress={() => router.push('/(app)/caregiver')}
        />
        <Row icon={icon(MapPin)} label="Location" detail="Shared only as part of an alert" onPress={() => router.push('/(app)/(tabs)/location')} />
        {isElderly && Platform.OS === 'android' ? (
          <Row icon={icon(BatteryCharging)} label="Battery settings" detail="Stop Android pausing monitoring in the background" onPress={() => watchApiService.openBatterySettings()} />
        ) : null}
        <Row icon={icon(ShieldCheck)} label="Permissions" detail="Notifications and location" onPress={() => Linking.openSettings()} />
      </Card>

      {calibrationAccess ? (
        <Card style={{ paddingVertical: spacing.sm }}>
          <Row icon={icon(SlidersHorizontal)} label="Detection configuration" detail="Authorized testing only" onPress={() => router.push('/(app)/insights/config')} />
          <Row icon={icon(FlaskConical)} label="Calibration" detail="Record labelled readings" onPress={() => router.push('/(app)/calibration')} />
        </Card>
      ) : null}

      {isElderly ? (
        <Card style={{ paddingVertical: spacing.sm }}>
          <Row icon={icon(Bluetooth)} label="Bluetooth watch" detail="For watches using the older Bluetooth firmware" onPress={() => router.push('/(app)/(tabs)/devices')} />
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Info size={24} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>About SafeFall AI</Text>
            <Text style={[type.body, { marginTop: 4 }]}>
              A prototype safety aid. It is not a certified medical device and does not contact emergency services by itself. Falls can be missed and false alarms can happen.
            </Text>
            <Text style={[styles.detail, { marginTop: spacing.sm }]}>Version {Constants.expoConfig?.version ?? 'unknown'}</Text>
          </View>
        </View>
      </Card>

      {env.devToolsEnabled ? (
        <Card tone="simulated">
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <FlaskConical size={24} color={colors.simulated} />
            <Text style={[type.bodyStrong, { color: colors.simulated, flex: 1 }]}>Developer tools are enabled in this build</Text>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm }]}>Never ship a release with EXPO_PUBLIC_ENABLE_DEV_TOOLS=true.</Text>
        </Card>
      ) : null}

      <Button title="Sign out" variant="danger" size="lg" isLoading={busy} icon={<LogOut size={22} color="#FFFFFF" />} onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: TOUCH_MIN + 16, paddingVertical: spacing.sm },
  detail: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
