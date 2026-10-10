import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { ChevronRight, User, Users, Phone, ShieldCheck, Info, LogOut, FlaskConical } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { signOutEverywhere, unsyncedIncidentCount } from '../../../services/session';
import { env } from '../../../config/env';
import { formatPhone } from '../../../utils/validation';
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
  const { profile, relations } = useAuthStore();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const isElderly = profile.role === 'elderly';

  const signOut = () => {
    const pending = unsyncedIncidentCount();
    Alert.alert(
      'Sign out?',
      pending > 0
        ? `${pending} alert${pending === 1 ? ' has' : 's have'} not reached the server yet. Signing out now may lose ${pending === 1 ? 'it' : 'them'}. Connect to the internet first if you can.`
        : isElderly
          ? 'Your watch will be disconnected from this phone and fall alerts will stop until you sign in again.'
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
      <Card onPress={() => router.push('/(app)/profile')} accessibilityLabel="Edit your profile">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View style={styles.avatar}>
            <User size={30} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.heading}>{profile.fullName}</Text>
            <Text style={styles.detail}>{profile.email}</Text>
            <Text style={styles.detail}>{formatPhone(profile.phone)} · {isElderly ? 'Watch wearer' : 'Caregiver'}</Text>
          </View>
          <ChevronRight size={24} color={colors.textSubtle} />
        </View>
      </Card>

      <Card style={{ paddingVertical: spacing.sm }}>
        {isElderly ? (
          <Row icon={<Phone size={26} color={colors.primary} />} label="Emergency contacts" detail="People you can call or text from an alert" onPress={() => router.push('/(app)/contacts')} />
        ) : null}
        <Row
          icon={<Users size={26} color={colors.primary} />}
          label={isElderly ? 'Caregivers' : 'People I care for'}
          detail={relations.length ? relations.map((r) => (isElderly ? r.caregiverName : r.elderlyName)).join(', ') : 'Nobody linked yet'}
          onPress={() => router.push('/(app)/caregiver')}
        />
        <Row icon={<ShieldCheck size={26} color={colors.primary} />} label="Permissions" detail="Bluetooth, location and notifications" onPress={() => Linking.openSettings()} />
      </Card>

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
          <Text style={[type.body, { marginTop: spacing.sm }]}>The watch simulator appears in the Watch tab search results. Never ship a release with EXPO_PUBLIC_ENABLE_DEV_TOOLS=true.</Text>
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
