import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'simulated';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: 'rgba(148,163,184,0.14)', fg: colors.textMuted },
  simulated: { bg: colors.simulatedSoft, fg: colors.simulated },
};

interface StatusBadgeProps {
  label: string;
  tone: Tone;
  style?: StyleProp<ViewStyle>;
}

/** Text label + colour + dot: status is never conveyed by colour alone. */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone, style }) => {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  text: { fontSize: 14, fontWeight: '700' },
});
