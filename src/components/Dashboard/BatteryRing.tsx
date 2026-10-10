import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme';

interface BatteryRingProps {
  /** null = unknown (watch not connected or cannot measure). Never shown as a number. */
  percentage: number | null;
  size?: number;
  strokeWidth?: number;
  caption?: string;
}

export const BatteryRing: React.FC<BatteryRingProps> = ({ percentage, size = 120, strokeWidth = 12, caption = 'Watch battery' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = percentage == null ? 0 : Math.max(0, Math.min(100, percentage));
  const color = percentage == null ? colors.textSubtle : pct > 50 ? colors.success : pct > 20 ? colors.warning : colors.danger;
  const label = percentage == null ? 'Battery level unknown' : `Battery ${pct} percent${pct <= 20 ? ', low' : ''}`;

  return (
    <View style={[styles.container, { width: size, height: size }]} accessible accessibilityLabel={label}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="transparent" />
        {percentage != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (pct / 100) * circumference}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <View style={styles.inner}>
        <Text style={[styles.value, { color: percentage == null ? colors.textSubtle : colors.text }]}>{percentage == null ? '--' : `${pct}%`}</Text>
        <Text style={styles.caption}>{percentage == null ? 'Unknown' : caption}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  inner: { position: 'absolute', alignItems: 'center' },
  value: { fontSize: 28, fontWeight: '800' },
  caption: { fontSize: 13, fontWeight: '600', color: colors.textSubtle, marginTop: 2 },
});
