import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDetectionStore } from '../../../store/detectionStore';
import { useWatchStore } from '../../../store/watchStore';
import { timeAgo } from '../../../emergency/labels';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LineChart } from '../../../components/Charts/LineChart';
import { AxisCard } from '../../../components/Watch/AxisCard';
import { useWatchBadge } from '../../../components/Watch/StatusRows';
import { colors, spacing, type } from '../../../theme';
import { DETECTION_LABEL } from '../../../watch/labels';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md }}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.bodyStrong, { flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

export default function MonitorScreen() {
  const router = useRouter();
  const badge = useWatchBadge();
  const connection = useWatchStore((s) => s.connection);
  const isStale = useWatchStore((s) => s.isStale);
  const reading = useWatchStore((s) => s.lastReading);
  const lastSampleAt = useWatchStore((s) => s.lastSampleAt);
  const history = useWatchStore((s) => s.history);
  const monitoringEnabled = useWatchStore((s) => s.monitoringEnabled);
  const state = useDetectionStore((s) => s.state);

  const live = connection === 'connected' && !isStale;
  const latest = history[history.length - 1];
  const magnitudes = useMemo(() => history.map((s) => s.smoothed), [history]);
  const detection = DETECTION_LABEL[state];

  return (
    <Screen title="Monitor" subtitle="Live readings from your watch." inTabs>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatusBadge label={badge.label} tone={badge.tone} />
          <StatusBadge label={monitoringEnabled ? 'Monitoring on' : 'Monitoring off'} tone={monitoringEnabled ? 'info' : 'neutral'} />
          <StatusBadge label={detection.label} tone={detection.tone} />
        </View>
        {!live ? (
          <>
            <Text style={[type.body, { marginTop: spacing.sm }]}>
              {reading ? `Showing the last reading, from ${timeAgo(lastSampleAt)}. It is not live.` : 'No readings yet. Connect to your watch to start.'}
            </Text>
            <Button title="Connect to your watch" variant="outline" onPress={() => router.push('/(app)/watch')} style={{ marginTop: spacing.md }} />
          </>
        ) : null}
      </Card>

      <AxisCard axis="x" samples={history} latest={reading?.x ?? null} live={live} color={colors.axisX} />
      <AxisCard axis="y" samples={history} latest={reading?.y ?? null} live={live} color={colors.axisY} />
      <AxisCard axis="z" samples={history} latest={reading?.z ?? null} live={live} color={colors.axisZ} />

      <Card>
        <Text style={type.label}>ACCELERATION MAGNITUDE</Text>
        <Text style={[type.metric, { marginTop: spacing.xs, marginBottom: spacing.sm }]} testID="magnitude">{latest ? latest.magnitude.toFixed(3) : '--'}</Text>
        <LineChart values={magnitudes} accessibilityLabel={`Smoothed magnitude history, ${magnitudes.length} readings`} />
        <Text style={{ fontSize: 14, color: colors.textSubtle, marginTop: spacing.xs }}>Units are not shown because the sensor configuration has not been confirmed.</Text>
      </Card>

      <Card>
        <Text style={[type.label, { marginBottom: spacing.xs }]}>WATCH</Text>
        <Row label="Date" value={reading?.date ?? '--'} />
        <Row label="Time" value={reading?.time ?? '--'} />
        <Row label="Epoch" value={reading ? String(reading.epoch) : '--'} />
        <Row label="Last received" value={timeAgo(lastSampleAt)} />
      </Card>

      <Button title="Detection insights" variant="outline" onPress={() => router.push('/(app)/insights')} />
    </Screen>
  );
}
