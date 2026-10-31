import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { colors, spacing } from '../../theme';

interface LineChartProps {
  values: number[];
  color?: string;
  height?: number;
  /** Spoken summary. Charts are invisible to a screen reader otherwise. */
  accessibilityLabel: string;
}

const PADDING = 4;

/** A restrained sparkline. Scales to its own data, because the sensor's units are not confirmed. */
export const LineChart: React.FC<LineChartProps> = ({ values, color = colors.primary, height = 72, accessibilityLabel }) => {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const { points, min, max, zeroY } = useMemo(() => {
    if (values.length < 2 || width === 0) return { points: '', min: 0, max: 0, zeroY: null };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const y = (v: number) => PADDING + (1 - (v - lo) / span) * (height - PADDING * 2);
    const stepX = width / (values.length - 1);
    return {
      points: values.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      min: lo,
      max: hi,
      zeroY: lo < 0 && hi > 0 ? y(0) : null,
    };
  }, [values, width, height]);

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ height: height + 20 }}>
      {points ? (
        <>
          <Svg width={width} height={height}>
            {zeroY !== null ? <Line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={colors.border} strokeWidth={1} /> : null}
            <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
          <View style={styles.scale}>
            <Text style={styles.scaleText}>min {min.toFixed(3)}</Text>
            <Text style={styles.scaleText}>max {max.toFixed(3)}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Waiting for readings</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  scaleText: { fontSize: 13, color: colors.textSubtle, fontVariant: ['tabular-nums'] },
  empty: { fontSize: 15, color: colors.textSubtle, paddingTop: spacing.lg },
});
