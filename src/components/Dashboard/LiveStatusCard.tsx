import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Watch } from 'lucide-react-native';
import { useDeviceStore } from '../../store/deviceStore';
import { bleService } from '../../services/bleService';
import { LINK_STATUS, timeAgo } from '../../emergency/labels';
import { colors, spacing, type } from '../../theme';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/Button';
import { SimulatedBadge } from '../ui/Feedback';
import { BatteryRing } from './BatteryRing';

/** Live watch status for the wearer's own phone. All values come from the BLE link. */
export const LiveStatusCard: React.FC<{ showTelemetry?: boolean }> = ({ showTelemetry = false }) => {
  const router = useRouter();
  const d = useDeviceStore();
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!showTelemetry) return;
    bleService.setTelemetryEnabled(true);
    return () => bleService.setTelemetryEnabled(false);
  }, [showTelemetry, d.linkStatus]);

  if (!d.paired) {
    return (
      <Card>
        <View style={styles.row}>
          <Watch size={28} color={colors.textSubtle} />
          <Text style={[type.heading, { flex: 1 }]}>No watch paired</Text>
        </View>
        <Text style={[type.body, { marginVertical: spacing.md }]}>
          Fall detection runs on your SafeFall watch. Pair it so this phone can receive its alerts.
        </Text>
        <Button title="Pair your watch" onPress={() => router.push('/(app)/(tabs)/devices')} />
      </Card>
    );
  }

  const link = LINK_STATUS[d.linkStatus];
  const connected = d.linkStatus === 'connected';
  const protectionLabel = !connected
    ? 'Fall alerts cannot reach this phone right now'
    : d.isStale
      ? 'Watch connected but not sending data'
      : d.imuOk === false
        ? 'Watch motion sensor error: fall detection unavailable'
        : 'Fall detection active on watch';

  return (
    <Card tone={d.paired.isSimulated ? 'simulated' : connected && !d.isStale ? 'accent' : 'danger'}>
      {d.paired.isSimulated ? <SimulatedBadge /> : null}
      <View style={[styles.row, { marginTop: d.paired.isSimulated ? spacing.md : 0 }]}>
        <BatteryRing percentage={connected ? d.batteryPercent : null} size={110} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={type.heading} numberOfLines={1}>
            {d.paired.name}
          </Text>
          <StatusBadge label={d.isStale && connected ? 'No recent data' : link.label} tone={d.isStale && connected ? 'warning' : link.tone} />
          <Text style={styles.small}>Last data: {timeAgo(d.lastPacketAt)}</Text>
        </View>
      </View>
      <Text
        style={[styles.protection, { color: connected && !d.isStale && d.imuOk !== false ? colors.success : colors.danger }]}
        accessibilityLiveRegion="polite"
      >
        {protectionLabel}
      </Text>
      {d.linkError && !connected ? <Text style={styles.small}>{d.linkError}</Text> : null}
      {d.linkStatus === 'reconnecting' && d.nextRetryAt ? (
        <Text style={styles.small}>Next attempt {d.nextRetryAt > Date.now() ? `in ${Math.ceil((d.nextRetryAt - Date.now()) / 1000)} s` : 'now'}</Text>
      ) : null}
      {!connected && d.linkStatus !== 'connecting' && d.linkStatus !== 'reconnecting' ? (
        <Button title="Reconnect now" variant="outline" onPress={() => bleService.reconnectNow().catch(() => undefined)} style={{ marginTop: spacing.md }} />
      ) : null}

      {showTelemetry && connected && d.hasTelemetry ? (
        <View style={styles.telemetry}>
          <Text style={styles.telemetryTitle}>Live motion (QMI8658)</Text>
          {d.telemetry ? (
            <>
              <Text style={styles.telemetryValue}>Acceleration: {d.telemetry.magnitudeG.toFixed(2)} g</Text>
              <Text style={styles.small}>
                X {d.telemetry.accel.x.toFixed(2)} · Y {d.telemetry.accel.y.toFixed(2)} · Z {d.telemetry.accel.z.toFixed(2)} g
              </Text>
              <Text style={styles.small}>
                Rotation X {d.telemetry.gyro.x.toFixed(0)} · Y {d.telemetry.gyro.y.toFixed(0)} · Z {d.telemetry.gyro.z.toFixed(0)} °/s
              </Text>
            </>
          ) : (
            <Text style={styles.small}>Waiting for motion data…</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  small: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
  protection: { fontSize: 17, fontWeight: '700', marginTop: spacing.lg },
  telemetry: { marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  telemetryTitle: { fontSize: 14, fontWeight: '700', color: colors.textSubtle, marginBottom: 6 },
  telemetryValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});
