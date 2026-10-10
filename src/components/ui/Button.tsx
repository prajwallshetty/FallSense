import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, TOUCH_MIN } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryText },
  secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerStrong, fg: '#FFFFFF' },
  outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.primary },
};

const SIZES: Record<Size, { minHeight: number; px: number; font: number }> = {
  sm: { minHeight: 44, px: 14, font: 15 },
  md: { minHeight: TOUCH_MIN, px: 18, font: 17 },
  lg: { minHeight: 60, px: 22, font: 18 },
  xl: { minHeight: 72, px: 26, font: 21 },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
  style,
  accessibilityHint,
  testID,
}) => {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const inactive = disabled || isLoading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: isLoading }}
      testID={testID}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, minHeight: s.minHeight, paddingHorizontal: s.px },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.disabled : null,
        style,
      ]}
    >
      {isLoading ? <ActivityIndicator color={v.fg} style={styles.icon} /> : icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, { color: v.fg, fontSize: s.font }]} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingVertical: 10 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  icon: { marginRight: 10 },
  text: { fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});
