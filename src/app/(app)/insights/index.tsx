import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useDetectionStore } from '../../../store/detectionStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { useWatchStore } from '../../../store/watchStore';
import { detectionStatusOf } from '../../../emergency/cloudMapping';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LineChart } from '../../../components/Charts/LineChart';
import { colors, spacing, type } from '../../../theme';
import { DETECTION_LABEL, MOVEMENT_LABEL, QUALITY_LABEL } from '../../../watch/labels';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: spacing.md }}>
      <Text style={{ fontSize: 15, color: colors.textSubtle }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const TIMELINE_TEXT: Record<string, string> = {
  state: 'State changed',
  dismissed: 'Possible event, cleared by movement',
  verification: 'Asked the user to confirm',
  escalated: 'Escalated immediately',
};

export default function InsightsScreen() {
  const router = useRouter();
  const calibrationAccess = useAuthStore((s) => s.calibrationAccess);
  const { state, movement, restMagnitude, evidence, timeline } = useDetectionStore();
  const history = useWatchStore((s) => s.history);
  const stats = useWatchStore((s) => s.stats);
  const incidents = useIncidentStore((s) => s.history);
  const d = DETECTION_LABEL[state];

  const magnitudes = useMemo(() => history.map((s) => s.magnitude), [history]);
  const jerk = useMemo(() => history.map((s) => s.jerk), [history]);
  const falseAlarms = incidents.filter((i) => i.detection && detectionStatusOf(i) === 'FALSE_ALARM').length;
  const confirmed = incidents.filter((i) => ['CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE'].includes(detectionStatusOf(i))).length;
  const total = stats.accepted + stats.missing;
  const lossRate = total ? stats.missing / total : 0;

  return (
    <Screen title="Detection insights" subtitle="How the detector sees your recent movement." back>
      <Card tone="warning">
        <Text style={type.bodyStrong}>Experimental detection</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>
          The rules are not calibrated against labelled falls. With one reading per second, a short impact can fall between readings, so falls can be missed and false alarms can happen.
        </Text>
      </Card>

      <Card>
        <Text style={type.label}>Current state</Text>
        <StatusBadge label={d.label} tone={d.tone} style={{ marginTop: spacing.sm }} />
        <Text style={[type.body, { marginTop: spacing.sm }]}>{d.detail}</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Stat label="Movement" value={MOVEMENT_LABEL[movement]} />
          <Stat label="Resting level" value={restMagnitude !== null ? restMagnitude.toFixed(3) : 'Still learning'} />
          <Stat label="False alarms" value={String(falseAlarms)} />
          <Stat label="Confirmed incidents" value={String(confirmed)} />
        </View>
      </Card>

      <Card>
        <Text style={type.label}>ACCELERATION MAGNITUDE</Text>
        <Text style={[type.metric, { marginVertical: spacing.xs }]}>{magnitudes.length ? magnitudes[magnitudes.length - 1].toFixed(3) : '--'}</Text>
        <LineChart values={magnitudes} accessibilityLabel="Acceleration magnitude trend" />
      </Card>

      <Card>
        <Text style={type.label}>JERK TREND</Text>
        <Text style={[type.metric, { marginVertical: spacing.xs }]}>{jerk.length ? jerk[jerk.length - 1].toFixed(3) : '--'}</Text>
        <LineChart values={jerk} color={colors.axisZ} accessibilityLabel="Jerk trend" />
      </Card>

      <Card>
        <Text style={type.label}>SENSOR QUALITY</Text>
        <Stat label="Readings received" value={String(stats.accepted)} />
        <Stat label="Missing (estimated)" value={String(stats.missing)} />
        {lossRate > 0.1 ? <Text style={[type.body, { color: colors.warning, marginTop: spacing.xs }]}>Readings are being missed. Check the distance to the watch and the Wi-Fi connection.</Text> : null}
        {evidence ? <Stat label="Last event quality" value={QUALITY_LABEL[evidence.quality].label} /> : null}
      </Card>

      {evidence ? (
        <Card>
          <Text style={type.label}>LAST EVENT</Text>
          <Stat label="Detection score" value={`${evidence.score.toFixed(2)} (heuristic, not a probability)`} />
          <Stat label="Movement after" value={MOVEMENT_LABEL[evidence.movement]} />
          <Stat label="Orientation change" value={evidence.orientationChangeDeg !== null ? `${evidence.orientationChangeDeg} degrees` : 'Not enough data'} />
          <Stat label="Still afterwards" value={evidence.stillFraction !== null ? `${Math.round(evidence.stillFraction * 100)}% of readings` : 'Not enough data'} />
        </Card>
      ) : null}

      <Card>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>RECENT EVENTS</Text>
        {timeline.length === 0 ? <Text style={type.body}>Nothing yet.</Text> : null}
        {timeline.slice(0, 15).map((e) => (
          <View key={e.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={type.bodyStrong}>{e.kind === 'state' ? DETECTION_LABEL[e.state].label : TIMELINE_TEXT[e.kind]}</Text>
            <Text style={{ fontSize: 14, color: colors.textSubtle }}>{new Date(e.at).toLocaleTimeString()}</Text>
          </View>
        ))}
      </Card>

      {calibrationAccess ? (
        <View style={{ gap: spacing.sm }}>
          <Button title="Detection configuration" variant="outline" onPress={() => router.push('/(app)/insights/config')} />
          <Button title="Calibration recordings" variant="outline" onPress={() => router.push('/(app)/calibration')} />
        </View>
      ) : null}
    </Screen>
  );
}
