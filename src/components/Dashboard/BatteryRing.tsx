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
    <View className="items-center justify-center" style={{ width: size, height: size }}>
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
      <View className="absolute items-center justify-center">
        <Text className="text-3xl font-extrabold text-slate-800 dark:text-white">
          {percentage}%
        </Text>
        <Text className="text-xxs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Battery
        </Text>
      </View>
    </View>
  );
};
