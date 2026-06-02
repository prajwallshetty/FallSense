import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface BatteryRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export const BatteryRing: React.FC<BatteryRingProps> = ({
  percentage,
  size = 140,
  strokeWidth = 12,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Determine colors based on charge level
  const getBatteryColors = () => {
    if (percentage > 50) return { start: '#0D9488', end: '#2DD4BF', text: 'text-teal-600 dark:text-teal-400' }; // Good - Teal
    if (percentage > 20) return { start: '#D97706', end: '#FBBF24', text: 'text-amber-600 dark:text-amber-400' }; // Moderate - Amber
    return { start: '#EF4444', end: '#F87171', text: 'text-red-600 dark:text-red-500 animate-pulse' }; // Critical - Red
  };

  const colors = getBatteryColors();

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id="batteryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.start} />
            <Stop offset="100%" stopColor={colors.end} />
          </LinearGradient>
        </Defs>

        {/* Gray Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeOpacity={0.2}
        />

        {/* Foreground Progress Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#batteryGrad)"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>

      {/* Inner Label */}
      <View style={styles.innerLabelContainer}>
        <Text style={styles.percentageText}>
          {percentage}%
        </Text>
        <Text style={styles.batteryText}>
          Battery
        </Text>
      </View>
    </View>
  );
};

import { StyleSheet } from 'react-native';
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerLabelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1E293B',
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#64748B',
  },
});
