import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Users, Watch } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { useCaregiverStore } from '../../../store/caregiverStore';
import { emergencyService } from '../../../services/emergencyService';
import { useElderProfile } from '../../../hooks/useElderProfile';
import { isOpen } from '../../../emergency/incidentMachine';
import { LINK_STATUS, timeAgo } from '../../../emergency/labels';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { EmptyState, ErrorBanner, LoadingState } from '../../../components/ui/Feedback';
import { LiveStatusCard } from '../../../components/Dashboard/LiveStatusCard';
import { DevToolsCard } from '../../../components/Dashboard/DevToolsCard';
import { BatteryRing } from '../../../components/Dashboard/BatteryRing';
import { SosButton } from '../../../components/Emergency/SosButton';
import { IncidentRow } from '../../../components/Emergency/IncidentRow';
import { CaregiverAlertCard } from '../../../components/Emergency/CaregiverAlertCard';
import { ElderPicker } from '../../../components/Caregiver/ElderPicker';
import { colors, spacing, type } from '../../../theme';

function ElderlyDashboard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile)!;
  const active = useIncidentStore((s) => s.active);
  const last = useIncidentStore((s) => s.history[0]);
  const [showMotion, setShowMotion] = useState(false);

  return (
    <Screen title={`Hello, ${profile.fullName.split(' ')[0]}`} subtitle="SafeFall is watching over you." inTabs>
      {active && isOpen(active.state) ? (
        <Card tone="danger" onPress={() => router.push('/alert')} accessibilityLabel="Open the active alert">
          <Text style={type.heading}>An alert is open</Text>
          <Text style={type.body}>Tap to view it.</Text>
        </Card>
      ) : null}
      <SosButton onConfirm={() => emergencyService.triggerManualSos({ uid: profile.userId, name: profile.fullName })} />
      <LiveStatusCard showTelemetry={showMotion} />
      <Button
        title={showMotion ? 'Hide live motion' : 'Show live motion from watch'}
        variant="ghost"
        onPress={() => setShowMotion((v) => !v)}
        style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}
      />
      {last ? (
        <>
          <Text style={[type.heading, { marginBottom: spacing.md }]}>Most recent alert</Text>
          <IncidentRow incident={last} />
        </>
      ) : null}
      <DevToolsCard />
    </Screen>
  );
}

function CaregiverDashboard() {
  const router = useRouter();
  const { profile, relations, relationsLoaded, activeElderlyId } = useAuthStore();
  const { alertsByElder, devicesByElder, errors, loaded } = useCaregiverStore();
  const elder = useElderProfile(activeElderlyId);
  const relation = relations.find((r) => r.elderlyId === activeElderlyId);

  if (!relationsLoaded) return <LoadingState label="Loading linked accounts…" />;

  if (relations.length === 0) {
    return (
      <Screen title={`Hello, ${profile?.fullName.split(' ')[0] ?? ''}`} inTabs>
        <EmptyState
          icon={<Users size={48} color={colors.textSubtle} />}
          title="You're not linked to anyone yet"
          body="Ask the person you care for to create a caregiver code in their SafeFall app, then enter it here."
          action={<Button title="Enter a caregiver code" onPress={() => router.push('/(app)/caregiver')} />}
        />
      </Screen>
    );
  }

  const id = activeElderlyId!;
  const alerts = alertsByElder[id] ?? [];
  const open = alerts.filter((a) => isOpen(a.state) && a.state !== 'possible_fall');
  const device = devicesByElder[id]?.[0];
  const deviceLink = device ? LINK_STATUS[device.linkStatus as keyof typeof LINK_STATUS] : null;
  const staleCloud = device && Date.now() - device.updatedAt > 30 * 60 * 1000;

  return (
    <Screen title={relation?.elderlyName ?? 'Overview'} subtitle="You receive this person's SafeFall alerts." inTabs>
      <ElderPicker />
      {errors[id] ? <ErrorBanner message={errors[id]} /> : null}
      {!loaded[id] ? <LoadingState label="Loading alerts…" /> : null}

      {open.length > 0 ? (
        open.map((a) => <CaregiverAlertCard key={a.id} incident={a} elderPhone={elder?.phone} />)
      ) : loaded[id] ? (
        <Card tone="accent">
          <StatusBadge label="No open alerts" tone="success" />
          <Text style={[type.body, { marginTop: spacing.sm }]}>
            {alerts[0] ? `Last alert ${timeAgo(alerts[0].createdAt)}.` : 'No alerts have been recorded.'}
          </Text>
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <BatteryRing percentage={device && !staleCloud ? device.batteryPercent : null} size={96} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Watch size={22} color={colors.textSubtle} />
              <Text style={type.heading}>Their watch</Text>
            </View>
            {device && deviceLink ? (
              <>
                <StatusBadge label={staleCloud ? 'Status out of date' : deviceLink.label} tone={staleCloud ? 'warning' : deviceLink.tone} />
                <Text style={{ fontSize: 15, color: colors.textSubtle }}>Reported by their phone {timeAgo(device.updatedAt)}</Text>
              </>
            ) : (
              <Text style={type.body}>No watch status reported yet.</Text>
            )}
          </View>
        </View>
      </Card>
    </Screen>
  );
}

export default function DashboardScreen() {
  const role = useAuthStore((s) => s.profile?.role);
  if (!role) return <LoadingState />;
  return role === 'caregiver' ? <CaregiverDashboard /> : <ElderlyDashboard />;
}
