import React, { useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useCalibrationStore } from '../../../store/calibrationStore';
import { useDetectionStore } from '../../../store/detectionStore';
import { useWatchStore } from '../../../store/watchStore';
import { ACTIVITIES, Activity, evaluate, Metrics } from '../../../detection/evaluation';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Chips } from '../../../components/ui/Segmented';
import { ErrorBanner } from '../../../components/ui/Feedback';
import { colors, spacing, type } from '../../../theme';

const LABELS: Record<Activity, string> = {
  walking: 'Walking',
  running: 'Running',
  sitting: 'Sitting',
  standing: 'Standing',
  lying_down: 'Lying down',
  wrist_movement: 'Wrist movement',
  watch_removal: 'Watch removal',
  simulated_fall: 'Simulated fall',
};

const pct = (v: number | null) => (v === null ? 'No data' : `${(v * 100).toFixed(1)}%`);

function MetricRows({ m }: { m: Metrics }) {
  const rows: [string, string][] = [
    ['Sensitivity / recall', pct(m.sensitivity)],
    ['Specificity', pct(m.specificity)],
    ['Precision', pct(m.precision)],
    ['Missed fall rate', pct(m.missedFallRate)],
    ['False alarms per hour', m.falseAlarmsPerHour === null ? 'No data' : m.falseAlarmsPerHour.toFixed(2)],
    ['Detection latency', m.meanLatencyMs === null ? 'No data' : `${(m.meanLatencyMs / 1000).toFixed(1)} s`],
  ];
  return (
    <>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
          <Text style={{ fontSize: 15, color: colors.textSubtle }}>{label}</Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{value}</Text>
        </View>
      ))}
    </>
  );
}

export default function CalibrationScreen() {
  const allowed = useAuthStore((s) => s.calibrationAccess);
  const config = useDetectionStore((s) => s.config);
  const connected = useWatchStore((s) => s.connection === 'connected' && !s.isStale);
  const { recordings, active, startRecording, stopRecording, discardRecording, markFall, deleteRecording } = useCalibrationStore();
  const [participant, setParticipant] = useState('');
  const [orientation, setOrientation] = useState('');
  const [activity, setActivity] = useState<Activity>('walking');
  const [error, setError] = useState<string | null>(null);
  const report = useMemo(() => (recordings.length ? evaluate(recordings, config) : null), [recordings, config]);

  if (!allowed) {
    return (
      <Screen title="Calibration" back>
        <ErrorBanner message="This screen is for authorized testing and calibration." />
      </Screen>
    );
  }

  const start = () => {
    if (!participant.trim() || !orientation.trim()) {
      setError('Enter a participant code and how the watch is worn.');
      return;
    }
    if (!connected) {
      setError('Connect to the watch first. Recordings must contain real readings.');
      return;
    }
    setError(null);
    startRecording({ participant: participant.trim(), activity, orientation: orientation.trim() });
  };

  const exportAll = () => Share.share({ message: JSON.stringify(recordings) }).catch(() => undefined);

  return (
    <Screen title="Calibration" subtitle="Record labelled readings to measure detection." back>
      <Card tone="warning">
        <Text style={type.bodyStrong}>Safety</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>Simulated falls must only be done under supervision, on protective mats, by adults who are able to do so safely. Never ask an older adult to simulate a fall.</Text>
      </Card>

      {error ? <ErrorBanner message={error} /> : null}

      {active ? (
        <Card tone="accent">
          <Text style={type.heading}>Recording: {LABELS[active.activity]}</Text>
          <Text style={[type.body, { marginTop: spacing.xs }]}>{active.samples.length} readings from {active.participant}</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {active.activity === 'simulated_fall' ? <Button title={active.fallAt ? 'Fall marked' : 'Mark the fall now'} variant="danger" disabled={!!active.fallAt} onPress={markFall} /> : null}
            <Button title="Stop and save" size="lg" onPress={stopRecording} />
            <Button title="Discard" variant="ghost" onPress={discardRecording} />
          </View>
        </Card>
      ) : (
        <Card>
          <Input label="Participant code" value={participant} onChangeText={setParticipant} autoCapitalize="characters" hint="A code, not a name." />
          <Input label="How the watch is worn" value={orientation} onChangeText={setOrientation} hint="For example: left wrist, face up." />
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Activity</Text>
          <Chips value={activity} options={ACTIVITIES.map((a) => ({ value: a, label: LABELS[a] }))} onChange={setActivity} accessibilityLabel="Activity being recorded" />
          <Button title="Start recording" size="lg" onPress={start} />
        </Card>
      )}

      <Card>
        <Text style={type.heading}>Recordings ({recordings.length})</Text>
        {recordings.slice(0, 20).map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{LABELS[r.activity]}</Text>
              <Text style={{ fontSize: 14, color: colors.textSubtle }}>{r.participant} · {r.orientation} · {r.samples.length} readings</Text>
            </View>
            <Button
              title="Delete"
              variant="ghost"
              size="sm"
              onPress={() => Alert.alert('Delete this recording?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteRecording(r.id) }])}
            />
          </View>
        ))}
        {recordings.length ? <Button title="Export all as JSON" variant="outline" onPress={exportAll} style={{ marginTop: spacing.md }} /> : null}
      </Card>

      {report ? (
        <Card>
          <Text style={type.heading}>Results on these recordings</Text>
          <Text style={[type.body, { marginTop: spacing.xs, marginBottom: spacing.sm }]}>These describe only the recordings above. They are not a claim about real-world accuracy.</Text>
          {report.warnings.map((w) => <Text key={w} style={[type.caption, { color: colors.warning, marginBottom: 4 }]}>{w}</Text>)}
          <Text style={[type.label, { marginTop: spacing.md }]}>All recordings</Text>
          <MetricRows m={report.overall} />
          {report.heldOut ? (
            <>
              <Text style={[type.label, { marginTop: spacing.md }]}>Held-out participants: {report.heldOut.testParticipants.join(', ')}</Text>
              <MetricRows m={report.heldOut.metrics} />
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
