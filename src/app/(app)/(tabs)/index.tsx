import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { OverviewEntry, needsAttention, STATUS_STALE_MS, useCaretakerStore } from '../../../store/caretakerStore';
import { useWatchStore } from '../../../store/watchStore';
import { emergencyService } from '../../../services/emergencyService';
import { isOpen } from '../../../emergency/incidentMachine';
import { timeAgo } from '../../../emergency/labels';
import { fromCloud, fromLocal } from '../../../emergency/history';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { EmptyState, ErrorBanner, LoadingState } from '../../../components/ui/Feedback';
import { SosButton } from '../../../components/Emergency/SosButton';
import { HistoryRow } from '../../../components/Emergency/HistoryRow';
import { CloudRow, SafetyCard, WatchCard } from '../../../components/Watch/StatusRows';
import { colors, spacing, type } from '../../../theme';
import { CONNECTION_LABEL, DETECTION_LABEL, formatAxis } from '../../../watch/labels';
import type { DetectionState } from '../../../detection/detectionEngine';
import type { ConnectionState } from '../../../store/watchStore';

function DemoNotice() {
  const isDemo = useAuthStore((s) => s.isDemo);
  if (!isDemo) return null;
  return (
    <Card tone="accent">
      <StatusBadge label="DEMO MODE" tone="info" />
      <Text style={[type.body, { marginTop: spacing.sm }]}>This is a local demonstration account, not a real sign-in.</Text>
    </Card>
  );
}

function UserHome() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile)!;
  const active = useIncidentStore((s) => s.active);
  const last = useIncidentStore((s) => s.history[0]);
  const reading = useWatchStore((s) => s.lastReading);
  const isStale = useWatchStore((s) => s.isStale);

  return (
    <Screen title={`Hello, ${profile.fullName.split(' ')[0]}`} inTabs>
      <DemoNotice />
      {active && isOpen(active.state) ? (
        <Card tone="danger" onPress={() => router.push('/alert')} accessibilityLabel="Open the active alert">
          <Text style={type.heading}>An alert is open</Text>
          <Text style={type.body}>Tap to view it.</Text>
        </Card>
      ) : null}
      <SafetyCard />
      <WatchCard />
      {reading ? (
        <Card onPress={() => router.push('/(app)/(tabs)/monitor')} accessibilityLabel="Open live readings">
          <Text style={type.label}>{isStale ? 'Last reading (not live)' : 'Latest reading'}</Text>
          <Text style={[type.bodyStrong, { marginTop: spacing.xs, fontVariant: ['tabular-nums'] }]}>
            X {formatAxis(reading.x)}   Y {formatAxis(reading.y)}   Z {formatAxis(reading.z)}
          </Text>
        </Card>
      ) : null}
      <SosButton onConfirm={() => emergencyService.triggerManualSos({ uid: profile.userId, name: profile.fullName })} />
      <CloudRow />
      {last ? (
        <>
          <Text style={[type.heading, { marginBottom: spacing.md }]}>Most recent alert</Text>
          <HistoryRow item={fromLocal(last)} />
        </>
      ) : null}
    </Screen>
  );
}

function PersonCard({ entry }: { entry: OverviewEntry }) {
  const { user, status, recentIncidents } = entry;
  const age = status ? Date.now() - Date.parse(status.updated_at) : null;
  const reporting = age !== null && age <= STATUS_STALE_MS;
  const connection = status ? CONNECTION_LABEL[status.watch_connection_status as ConnectionState] : null;
  const safety = status ? DETECTION_LABEL[status.safety_state as DetectionState] : null;
  const open = recentIncidents.filter(needsAttention);

  return (
    <>
      <Card>
        <Text style={type.heading}>{user.name}</Text>
        {user.relationship ? <Text style={{ fontSize: 15, color: colors.textSubtle, marginTop: 2 }}>{user.relationship}</Text> : null}
        {!status ? (
          <Text style={[type.body, { marginTop: spacing.sm }]}>This phone has not reported anything yet.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
              {reporting && connection ? <StatusBadge label={connection.label} tone={connection.tone} /> : <StatusBadge label="Phone not reporting" tone="warning" />}
              {reporting && safety ? <StatusBadge label={safety.label} tone={safety.tone} /> : null}
            </View>
            {!reporting ? (
              <Text style={[type.body, { marginTop: spacing.sm }]}>Their phone last reported {timeAgo(Date.parse(status.updated_at))}. They may not be monitored right now.</Text>
            ) : null}
            <Text style={{ fontSize: 15, color: colors.textSubtle, marginTop: spacing.sm }}>Last report: {timeAgo(Date.parse(status.updated_at))}</Text>
            <Text style={{ fontSize: 15, color: colors.textSubtle, marginTop: 2 }}>Last sensor sync: {status.last_sync ? timeAgo(Date.parse(status.last_sync)) : 'never'}</Text>
            <Text style={[type.bodyStrong, { marginTop: spacing.sm, fontVariant: ['tabular-nums'] }]}>
              X {formatAxis(status.latest_x)}   Y {formatAxis(status.latest_y)}   Z {formatAxis(status.latest_z)}
            </Text>
          </>
        )}
      </Card>
      {open.map((i) => <HistoryRow key={i.id} item={fromCloud(i)} />)}
      {recentIncidents.length > open.length ? <Text style={[type.heading, { marginBottom: spacing.md }]}>Recent incidents</Text> : null}
      {recentIncidents.filter((i) => !needsAttention(i)).slice(0, 3).map((i) => <HistoryRow key={i.id} item={fromCloud(i)} />)}
    </>
  );
}

function CaretakerHome() {
  const isDemo = useAuthStore((s) => s.isDemo);
  const name = useAuthStore((s) => s.profile?.fullName ?? '');
  const relations = useAuthStore((s) => s.relations);
  const { overview, loaded, error, pushProblem, refresh, lastFetchedAt } = useCaretakerStore();

  if (isDemo) {
    return (
      <Screen title={`Hello, ${name.split(' ')[0]}`} inTabs>
        <DemoNotice />
        <Card>
          <Text style={type.heading}>{relations[0]?.elderlyName}</Text>
          <StatusBadge label="No live data in demo mode" tone="neutral" style={{ marginTop: spacing.sm }} />
          <Text style={[type.body, { marginTop: spacing.sm }]}>Caretaker data comes from the cloud, which demo accounts do not use. Sign in with a caretaker access code to see a real person.</Text>
        </Card>
      </Screen>
    );
  }
  if (!loaded) return <LoadingState label="Loading…" />;

  return (
    <Screen title={`Hello, ${name.split(' ')[0]}`} inTabs refreshing={false} onRefresh={refresh}>
      {pushProblem ? <ErrorBanner message={`Alerts may not reach this phone. ${pushProblem}`} /> : null}
      {error ? <ErrorBanner message={`Could not refresh: ${error}. Showing data from ${timeAgo(lastFetchedAt)}.`} onRetry={refresh} /> : null}
      {overview.length === 0 ? (
        <EmptyState icon={<Users size={48} color={colors.textSubtle} />} title="Nobody is linked yet" body="Ask your SafeFall administrator to link you to the person you care for." />
      ) : (
        overview.map((o) => <PersonCard key={o.user.id} entry={o} />)
      )}
    </Screen>
  );
}

export default function DashboardScreen() {
  const role = useAuthStore((s) => s.profile?.role);
  if (!role) return <LoadingState />;
  return role === 'caregiver' ? <CaretakerHome /> : <UserHome />;
}
