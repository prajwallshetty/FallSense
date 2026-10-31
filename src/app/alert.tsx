import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldAlert, Phone, MessageSquare, CheckCircle2 } from 'lucide-react-native';
import { useIncidentStore } from '../store/incidentStore';
import { useAuthStore } from '../store/authStore';
import { emergencyService } from '../services/emergencyService';
import { notificationService } from '../services/notificationService';
import { callNumber, incidentMessage, textContacts } from '../services/contactActions';
import { useEmergencyContacts } from '../hooks/useEmergencyContacts';
import { dispatchSummary, INCIDENT_STATE, sourceLabel } from '../emergency/labels';
import { isOpen } from '../emergency/incidentMachine';
import { env } from '../config/env';
import { useCloudStore } from '../store/cloudStore';
import { formatPhone } from '../utils/validation';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SimulatedBadge } from '../components/ui/Feedback';
import { LiveMap } from '../components/Map/LiveMap';
import { colors, radius, spacing, type } from '../theme';

/**
 * Full-screen incident view for the wearer's phone.
 * possible_fall / countdown: cancel or get help now. escalated / acknowledged: contact actions
 * and resolution. Android back is blocked while an incident is open: closing must be explicit.
 */
export default function AlertScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const incident = useIncidentStore((s) => s.active);
  const profile = useAuthStore((s) => s.profile);
  const isDemo = useAuthStore((s) => s.isDemo);
  const cloudStatus = useCloudStore((s) => s.status);
  const { contacts } = useEmergencyContacts(profile?.userId);
  const [now, setNow] = useState(Date.now());
  const [actionResult, setActionResult] = useState<string | null>(null);

  const open = !!incident && isOpen(incident.state);
  const urgent = open && incident.state !== 'acknowledged';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => open);
    return () => sub.remove();
  }, [open]);

  useEffect(() => {
    if (urgent) notificationService.startAlertVibration();
    else notificationService.stopAlertVibration();
    return () => notificationService.stopAlertVibration();
  }, [urgent]);

  useEffect(() => {
    if (!open) {
      if (router.canGoBack()) router.back();
      else router.replace('/(app)/(tabs)');
    }
  }, [open, router]);

  if (!incident || !open || !profile) return <View style={styles.root} />;

  const uid = profile.userId;
  const st = INCIDENT_STATE[incident.state];
  const secondsLeft =
    incident.state === 'countdown' && incident.countdownEndsAt ? Math.max(0, Math.ceil((incident.countdownEndsAt - now) / 1000)) : null;
  const primary = contacts[0];
  const dispatch = isDemo
    ? { text: 'Demo mode: nobody was notified.', tone: 'info' as const }
    : cloudStatus === 'offline' && incident.version > incident.syncedVersion
      ? { text: 'No internet right now. This alert is saved and will be sent automatically when the phone is back online. Use the buttons below to reach someone directly.', tone: 'warning' as const }
      : dispatchSummary(incident);

  const resolve = (resolution: 'false_alarm' | 'assisted') =>
    Alert.alert(
      resolution === 'false_alarm' ? 'Close this alert?' : 'Mark help as arrived?',
      resolution === 'false_alarm'
        ? 'Your caregivers will see that you are OK and the alert is closed.'
        : 'The alert will be closed as resolved.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Yes, close alert', onPress: () => emergencyService.resolve(uid, resolution) },
      ],
    );

  const isEarly = incident.state === 'possible_fall' || incident.state === 'countdown';

  return (
    <View style={[styles.root, { backgroundColor: isEarly ? '#3B0A0A' : colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}>
        {incident.simulated ? (
          <View style={{ marginBottom: spacing.md }}>
            <SimulatedBadge />
            <Text style={[type.caption, { marginTop: 6 }]}>Simulator test. Nobody will be notified.</Text>
          </View>
        ) : null}

        <View style={styles.header} accessibilityLiveRegion="assertive">
          <ShieldAlert size={56} color={isEarly ? '#FCA5A5' : colors.danger} />
          <Text style={[styles.title, !isEarly ? { color: colors.text } : null]} accessibilityRole="header">
            {incident.state === 'possible_fall'
              ? 'Possible fall detected'
              : incident.state === 'countdown'
                ? 'Are you OK?'
                : incident.state === 'acknowledged'
                  ? `${incident.acknowledgedBy?.name ?? 'A caregiver'} is responding`
                  : incident.source === 'wearable'
                    ? 'Getting you help'
                    : 'SOS sent'}
          </Text>
          <Text style={[styles.subtitle, !isEarly ? { color: colors.textMuted } : null]}>{sourceLabel(incident)} · {new Date(incident.createdAt).toLocaleTimeString()}</Text>
          <StatusBadge label={st.label} tone={st.tone} style={{ alignSelf: 'center', marginTop: spacing.md }} />
        </View>

        {incident.timeline.some((t) => t.type === 'delivered_late') ? (
          <Text style={[styles.explain, { marginBottom: spacing.lg, fontWeight: '700' }]}>
            {incident.timeline.find((t) => t.type === 'delivered_late')?.detail}. The phone was probably out of range.
          </Text>
        ) : null}
        {secondsLeft != null ? (
          <View style={styles.countdown} accessible accessibilityLabel={`Your caretaker will be alerted in ${secondsLeft} seconds`}>
            <Text style={styles.countdownNumber}>{secondsLeft}</Text>
            <Text style={styles.countdownLabel}>seconds until your caretaker is alerted</Text>
          </View>
        ) : null}
        {incident.state === 'possible_fall' ? (
          <Text style={[styles.explain, { marginBottom: spacing.xl }]}>Your watch noticed a hard impact and is checking whether you are moving.</Text>
        ) : null}

        {isEarly ? (
          <View style={{ gap: spacing.md }}>
            <Button
              title="I'M OK"
              size="xl"
              icon={<CheckCircle2 size={28} color={colors.primaryText} />}
              onPress={() => emergencyService.cancel(uid)}
              accessibilityHint="Closes the alert. It stays in your history and nobody is notified."
              testID="cancel-alert"
            />
            <Button title="EMERGENCY HELP" size="xl" variant="danger" onPress={() => emergencyService.escalateNow(uid)} accessibilityHint="Alerts your caretaker immediately" testID="emergency-help" />
          </View>
        ) : (
          <>
            {incident.state === 'escalated' && incident.finalUserResponse !== 'requested_help' ? (
              <Button title="I'M OK" size="xl" onPress={() => resolve('false_alarm')} accessibilityHint="Tells your caretaker you are OK and closes the alert" testID="im-ok-escalated" style={{ marginBottom: spacing.lg }} />
            ) : null}
            <View style={[styles.dispatch, { borderColor: dispatch.tone === 'danger' ? colors.danger : dispatch.tone === 'warning' ? colors.warning : colors.border }]}>
              <Text style={type.bodyStrong}>Caretaker notification</Text>
              <Text style={[type.body, { marginTop: 4 }]}>{dispatch.text}</Text>
            </View>

            <Text style={[type.heading, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Get in touch</Text>
            {primary ? (
              <Button
                title={`Call ${primary.name}`}
                size="lg"
                icon={<Phone size={24} color={colors.primaryText} />}
                onPress={async () => setActionResult((await callNumber(primary.phone)).message)}
                accessibilityHint={formatPhone(primary.phone)}
                style={{ marginBottom: spacing.md }}
              />
            ) : null}
            {contacts.length > 0 ? (
              <Button
                title={contacts.length === 1 ? `Text ${contacts[0].name}` : `Text all ${contacts.length} contacts`}
                size="lg"
                variant="secondary"
                icon={<MessageSquare size={24} color={colors.text} />}
                onPress={async () => setActionResult((await textContacts(contacts.map((c) => c.phone), incidentMessage(incident))).message)}
                style={{ marginBottom: spacing.md }}
              />
            ) : (
              <Text style={[type.body, { marginBottom: spacing.md }]}>No emergency contacts saved. Add them in Settings.</Text>
            )}
            {env.emergencyServicesNumber ? (
              <Button
                title={`Call emergency services (${env.emergencyServicesNumber})`}
                size="lg"
                variant="danger"
                icon={<Phone size={24} color="#FFFFFF" />}
                onPress={async () => setActionResult((await callNumber(env.emergencyServicesNumber)).message)}
                style={{ marginBottom: spacing.md }}
              />
            ) : null}
            {actionResult ? (
              <Text style={[type.caption, { marginBottom: spacing.md }]} accessibilityLiveRegion="polite">
                {actionResult}
              </Text>
            ) : null}
          </>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <LiveMap location={incident.location} title="Location sent with this alert" />
        </View>

        {!isEarly ? (
          <View style={{ gap: spacing.md }}>
            <Button title="Help has arrived" variant="outline" size="lg" onPress={() => resolve('assisted')} />
          </View>
        ) : null}
        <Text style={styles.disclaimer}>SafeFall AI does not contact emergency services automatically.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginTop: spacing.md },
  subtitle: { fontSize: 16, color: '#FECACA', marginTop: spacing.sm, textAlign: 'center' },
  countdown: { alignItems: 'center', marginBottom: spacing.xxl },
  countdownNumber: { fontSize: 96, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  countdownLabel: { fontSize: 18, fontWeight: '700', color: '#FECACA', textAlign: 'center' },
  explain: { ...type.body, color: '#FECACA', textAlign: 'center' },
  dispatch: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.surface },
  disclaimer: { ...type.caption, textAlign: 'center', marginTop: spacing.xl },
});
