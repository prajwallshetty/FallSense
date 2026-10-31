import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cloud, Watch } from 'lucide-react-native';
import { timeAgo } from '../../emergency/labels';
import { useAuthStore } from '../../store/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDetectionStore } from '../../store/detectionStore';
import { useWatchStore } from '../../store/watchStore';
import { colors, spacing, type } from '../../theme';
import { CLOUD_LABEL, CONNECTION_LABEL, DETECTION_LABEL } from '../../watch/labels';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/StatusBadge';

export function useWatchBadge() {
  const connection = useWatchStore((s) => s.connection);
  const isStale = useWatchStore((s) => s.isStale);
  if (connection === 'connected' && isStale) return { label: 'Readings stopped', tone: 'warning' as const };
  return CONNECTION_LABEL[connection];
}

export const SafetyCard: React.FC = () => {
  const state = useDetectionStore((s) => s.state);
  const d = DETECTION_LABEL[state];
  return (
    <Card tone={d.tone === 'danger' ? 'danger' : d.tone === 'warning' ? 'warning' : 'default'}>
      <Text style={type.label}>Safety status</Text>
      <StatusBadge label={d.label} tone={d.tone} style={{ marginTop: spacing.sm }} />
      <Text style={[type.body, { marginTop: spacing.sm }]}>{d.detail}</Text>
    </Card>
  );
};

export const WatchCard: React.FC = () => {
  const router = useRouter();
  const badge = useWatchBadge();
  const connection = useWatchStore((s) => s.connection);
  const lastSampleAt = useWatchStore((s) => s.lastSampleAt);
  const live = connection === 'connected';
  return (
    <Card>
      <View style={styles.head}>
        <Watch size={22} color={colors.textSubtle} />
        <Text style={[type.heading, { flex: 1 }]}>Your watch</Text>
      </View>
      <StatusBadge label={badge.label} tone={badge.tone} style={{ marginTop: spacing.sm }} />
      <Text style={styles.meta}>Last successful sync: {timeAgo(lastSampleAt)}</Text>
      <Button
        title={live ? 'Watch settings' : 'Connect to your watch'}
        variant={live ? 'outline' : 'primary'}
        onPress={() => router.push('/(app)/watch')}
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
};

export const CloudRow: React.FC = () => {
  const status = useCloudStore((s) => s.status);
  const message = useCloudStore((s) => s.message);
  const lastSuccessAt = useCloudStore((s) => s.lastSuccessAt);
  const pendingIncidents = useCloudStore((s) => s.pendingIncidents);
  const isDemo = useAuthStore((s) => s.isDemo);
  const c = CLOUD_LABEL[status];
  return (
    <Card>
      <View style={styles.head}>
        <Cloud size={22} color={colors.textSubtle} />
        <Text style={[type.heading, { flex: 1 }]}>Cloud</Text>
      </View>
      <StatusBadge label={c.label} tone={c.tone} style={{ marginTop: spacing.sm }} />
      {isDemo ? <Text style={styles.meta}>Demo mode sends nothing to the cloud. Your caretaker is not notified.</Text> : null}
      {!isDemo && status !== 'disabled' ? <Text style={styles.meta}>Last confirmed upload: {timeAgo(lastSuccessAt)}</Text> : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}
      {pendingIncidents > 0 ? <Text style={[styles.meta, { color: colors.warning, fontWeight: '600' }]}>{pendingIncidents} alert{pendingIncidents === 1 ? '' : 's'} waiting to upload</Text> : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: spacing.sm, lineHeight: 21 },
});
