import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { History as HistoryIcon, Activity } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { useActivityStore, ActivityEntry } from '../../../store/activityStore';
import { useCaregiverStore } from '../../../store/caregiverStore';
import { firebaseService } from '../../../services/firebase';
import { describeFirebaseError } from '../../../services/firebaseApp';
import { Incident } from '../../../emergency/incidentMachine';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { EmptyState, ErrorBanner } from '../../../components/ui/Feedback';
import { IncidentRow } from '../../../components/Emergency/IncidentRow';
import { ElderPicker } from '../../../components/Caregiver/ElderPicker';
import { colors, radius, spacing, TOUCH_MIN, type } from '../../../theme';

const ACTIVITY_LABEL: Record<ActivityEntry['type'], string> = {
  watch_connected: 'Watch connected',
  watch_disconnected: 'Watch disconnected',
  watch_reconnecting: 'Reconnecting to watch',
  watch_paired: 'Watch paired',
  watch_unpaired: 'Watch removed',
  battery_low: 'Low watch battery',
  data_stale: 'Watch stopped sending data',
  protocol_error: 'Unreadable data from watch',
  incident: 'Alert',
};

function useOwnAlerts(uid: string | undefined) {
  const local = useIncidentStore((s) => s.history);
  const active = useIncidentStore((s) => s.active);
  const [cloud, setCloud] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    return firebaseService.subscribeAlertsFor(uid, setCloud, (e) => setError(describeFirebaseError(e)));
  }, [uid]);
  const merged = useMemo(() => {
    const byId = new Map<string, Incident>();
    for (const c of cloud) byId.set(c.id, c);
    for (const l of [...(active ? [active] : []), ...local]) byId.set(l.id, l); // local copy is newest
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [cloud, local, active]);
  return { alerts: merged, error };
}

function Segments({ value, onChange }: { value: 'alerts' | 'activity'; onChange: (v: 'alerts' | 'activity') => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {(['alerts', 'activity'] as const).map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="tab" accessibilityState={{ selected: value === v }} style={[styles.segment, value === v ? styles.segmentOn : null]}>
          <Text style={[styles.segmentText, value === v ? { color: colors.primaryText } : null]}>{v === 'alerts' ? 'Alerts' : 'Watch activity'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const { profile, activeElderlyId } = useAuthStore();
  const isCaregiver = profile?.role === 'caregiver';
  const [tab, setTab] = useState<'alerts' | 'activity'>('alerts');
  const own = useOwnAlerts(isCaregiver ? undefined : profile?.userId);
  const caregiverAlerts = useCaregiverStore((s) => (activeElderlyId ? s.alertsByElder[activeElderlyId] : undefined));
  const caregiverError = useCaregiverStore((s) => (activeElderlyId ? s.errors[activeElderlyId] : undefined));
  const activity = useActivityStore((s) => s.entries);

  const alerts = isCaregiver ? caregiverAlerts ?? [] : own.alerts;
  const error = isCaregiver ? caregiverError : own.error;

  return (
    <Screen title="History" subtitle={isCaregiver ? 'Alerts for the person you care for.' : 'Your alerts and watch activity.'} inTabs>
      {isCaregiver ? <ElderPicker /> : <Segments value={tab} onChange={setTab} />}
      {error ? <ErrorBanner message={error} /> : null}
      {tab === 'alerts' || isCaregiver ? (
        alerts.length ? (
          alerts.map((a) => <IncidentRow key={a.id} incident={a} />)
        ) : (
          <EmptyState icon={<HistoryIcon size={44} color={colors.textSubtle} />} title="No alerts yet" body="Falls detected by the watch and SOS alerts will appear here." />
        )
      ) : activity.length ? (
        <Card>
          {activity.map((e, i) => (
            <View key={e.id} style={[styles.activityRow, i > 0 ? styles.divider : null]}>
              <Text style={type.bodyStrong}>
                {ACTIVITY_LABEL[e.type]}
                {e.simulated ? ' (simulated)' : ''}
              </Text>
              <Text style={styles.meta}>{e.detail}</Text>
              <Text style={styles.meta}>{new Date(e.at).toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Activity size={44} color={colors.textSubtle} />} title="No watch activity yet" body="Connections, disconnections and battery warnings will be listed here." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, minHeight: TOUCH_MIN - 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  activityRow: { paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
});
