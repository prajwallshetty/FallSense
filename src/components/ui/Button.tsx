import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
}) => {
  const variantStyles: Record<string, { container: ViewStyle; textColor: string }> = {
    primary: { container: { backgroundColor: '#0D9488' }, textColor: '#FFFFFF' },
    secondary: { container: { backgroundColor: '#1E293B' }, textColor: '#F1F5F9' },
    danger: { container: { backgroundColor: '#EF4444' }, textColor: '#FFFFFF' },
    outline: { container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' }, textColor: '#E2E8F0' },
    ghost: { container: { backgroundColor: 'transparent' }, textColor: '#94A3B8' },
  };

  const sizeStyles: Record<string, { container: ViewStyle; fontSize: number }> = {
    sm: { container: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }, fontSize: 13 },
    md: { container: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 }, fontSize: 15 },
    lg: { container: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 18, minHeight: 52 }, fontSize: 17 },
    xl: { container: { paddingVertical: 20, paddingHorizontal: 32, borderRadius: 20, minHeight: 64 }, fontSize: 20 },
  };

  const v = variantStyles[variant] || variantStyles.primary;
  const s = sizeStyles[size] || sizeStyles.md;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[
        styles.base,
        v.container,
        s.container,
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={v.textColor} style={{ marginRight: 8 }} />
      ) : null}
      <Text style={[styles.text, { color: v.textColor, fontSize: s.fontSize }]}>
        {title}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
