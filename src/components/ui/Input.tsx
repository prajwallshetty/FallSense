import React from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle } from 'react-native';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  style?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  style,
  ...props
}) => {
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        style={[styles.input, error ? styles.inputError : null]}
        {...props}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16, width: '100%' },
  label: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginBottom: 6, marginLeft: 4 },
  input: {
    width: '100%',
    backgroundColor: '#020617',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    fontSize: 16,
  },
  inputError: { borderColor: '#EF4444' },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: 4, marginLeft: 4, fontWeight: '500' },
});
