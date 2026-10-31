import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sample } from '../../services/sensorService';
import { colors, spacing, type } from '../../theme';
import { formatAxis } from '../../watch/labels';
import { LineChart } from '../Charts/LineChart';
import { Card } from '../ui/Card';

interface AxisCardProps {
  axis: 'x' | 'y' | 'z';
  samples: Sample[];
  latest: number | null;
  live: boolean;
  color: string;
}

/** One axis: the latest reading, whether it is live, and its recent history. No unit is shown, because
 *  the firmware's sensor configuration has not confirmed one. */
export const AxisCard: React.FC<AxisCardProps> = ({ axis, samples, latest, live, color }) => {
  const name = `${axis.toUpperCase()} AXIS`;
  const values = useMemo(() => samples.map((s) => s[axis]), [samples, axis]);
  return (
    <Card>
      <View style={styles.head}>
        <Text style={type.label}>{name}</Text>
        <View style={styles.live} accessible accessibilityLabel={live ? `${name} updating live` : `${name} not live`}>
          <View style={[styles.dot, { backgroundColor: live ? colors.success : colors.borderStrong }]} />
          <Text style={[styles.liveText, { color: live ? colors.success : colors.textSubtle }]}>{live ? 'Live' : 'Not live'}</Text>
        </View>
      </View>
      <Text style={[type.metric, { marginTop: spacing.xs, marginBottom: spacing.sm, color: live ? colors.text : colors.textSubtle }]} testID={`axis-${axis}`}>
        {formatAxis(latest)}
      </Text>
      <LineChart values={values} color={color} accessibilityLabel={`${name} history, ${values.length} readings`} />
    </Card>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 14, fontWeight: '600' },
});
