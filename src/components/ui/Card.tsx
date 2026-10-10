import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'danger' | 'warning' | 'accent' | 'simulated';
}

const BORDER = {
  default: colors.border,
  danger: colors.danger,
  warning: colors.warning,
  accent: colors.primary,
  simulated: colors.simulated,
};

export const Card: React.FC<CardProps> = ({ children, style, onPress, accessibilityLabel, tone = 'default' }) => {
  const base = [styles.card, { borderColor: BORDER[tone] }, style];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [...base, pressed ? { opacity: 0.85 } : null]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
});
