import React, { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useDetectionStore } from '../../../store/detectionStore';
import { CONFIG_LIMITS, DetectionConfig } from '../../../detection/config';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorBanner } from '../../../components/ui/Feedback';
import { colors, spacing, type } from '../../../theme';

type NumericKey = keyof typeof CONFIG_LIMITS;

const FIELDS: { key: NumericKey; label: string }[] = [
  { key: 'transientRatio', label: 'Transient, ratio of resting level' },
  { key: 'hardTransientRatio', label: 'Hard transient, ratio of resting level' },
  { key: 'jerkRatio', label: 'Sudden change, ratio per second' },
  { key: 'orientationChangeDeg', label: 'Orientation change (degrees)' },
  { key: 'postEventSeconds', label: 'Observation after an event (seconds)' },
  { key: 'stillStdRatio', label: 'Stillness limit, ratio of resting level' },
  { key: 'stillFraction', label: 'Stillness needed, fraction of readings' },
  { key: 'verifyScore', label: 'Score that asks the user' },
  { key: 'poorQualityVerifyScore', label: 'Score that asks the user on poor data' },
  { key: 'cooldownSeconds', label: 'Cooldown after an event (seconds)' },
  { key: 'baselineSamples', label: 'Readings to learn the resting level' },
];

export default function DetectionConfigScreen() {
  const router = useRouter();
  const allowed = useAuthStore((s) => s.calibrationAccess);
  const { config, setConfig, resetConfig } = useDetectionStore();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(config[f.key])])));
  const [immediate, setImmediate] = useState(config.immediateEscalation);

  if (!allowed) {
    return (
      <Screen title="Detection configuration" back>
        <ErrorBanner message="This screen is for authorized testing and calibration." />
      </Screen>
    );
  }

  const save = () => {
    const next: Partial<DetectionConfig> = { immediateEscalation: immediate };
    for (const f of FIELDS) next[f.key] = Number(draft[f.key]);
    const applied = setConfig(next);
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(applied[f.key])])));
    router.back();
  };

  const reset = () =>
    Alert.alert('Reset thresholds?', 'All detection values return to their defaults.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          const d = resetConfig();
          setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(d[f.key])])));
          setImmediate(d.immediateEscalation);
        },
      },
    ]);

  return (
    <Screen title="Detection configuration" back>
      <Card tone="warning">
        <Text style={type.bodyStrong}>For testing and calibration only</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>These are experimental values, not validated medical settings. Values outside the allowed range are limited automatically.</Text>
      </Card>
      <Card>
        {FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            hint={`Allowed: ${CONFIG_LIMITS[f.key][0]} to ${CONFIG_LIMITS[f.key][1]}`}
            value={draft[f.key]}
            onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
            keyboardType="decimal-pad"
          />
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <Text style={[type.body, { flex: 1 }]}>Escalate high-risk events immediately</Text>
          <Switch value={immediate} onValueChange={setImmediate} trackColor={{ true: colors.primary }} accessibilityLabel="Escalate high-risk events immediately" />
        </View>
        <Button title="Save" size="lg" onPress={save} />
        <Button title="Reset to defaults" variant="ghost" onPress={reset} style={{ marginTop: spacing.sm }} />
      </Card>
    </Screen>
  );
}
