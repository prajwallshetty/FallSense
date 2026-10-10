import React from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, TOUCH_MIN } from '../../theme';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input: React.FC<InputProps> = ({ label, error, hint, containerStyle, style, ...props }) => (
  <View style={[styles.wrapper, containerStyle]}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      placeholderTextColor={colors.textSubtle}
      accessibilityLabel={label}
      accessibilityHint={error ?? hint}
      style={[styles.input, error ? styles.inputError : null, style]}
      {...props}
    />
    {error ? (
      <Text style={styles.error} accessibilityLiveRegion="polite">
        {error}
      </Text>
    ) : hint ? (
      <Text style={styles.hint}>{hint}</Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  wrapper: { marginBottom: 18, width: '100%' },
  label: { fontSize: 16, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  input: {
    minHeight: TOUCH_MIN + 4,
    backgroundColor: colors.bg,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    fontSize: 18,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 15, color: colors.danger, marginTop: 6, fontWeight: '600' },
  hint: { fontSize: 14, color: colors.textSubtle, marginTop: 6 },
});
