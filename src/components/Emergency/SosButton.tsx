import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Siren } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';

/** Large, always-visible manual SOS. A confirmation step prevents pocket presses. */
export const SosButton: React.FC<{ onConfirm: () => void; disabled?: boolean }> = ({ onConfirm, disabled }) => (
  <Pressable
    onPress={() =>
      Alert.alert('Send SOS?', 'Your caregivers will be alerted immediately with your location (if available).', [
        { text: 'No, go back', style: 'cancel' },
        { text: 'Yes, send SOS', style: 'destructive', onPress: onConfirm },
      ])
    }
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel="SOS. Ask your caregivers for help"
    accessibilityHint="Asks for confirmation, then alerts your caregivers"
    style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.85 } : null, disabled ? { opacity: 0.5 } : null]}
  >
    <View style={styles.icon}>
      <Siren size={34} color="#FFFFFF" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>SOS</Text>
      <Text style={styles.sub}>Press to ask your caregivers for help</Text>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.dangerStrong, borderRadius: radius.xl, minHeight: 96, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  sub: { color: '#FFE4E6', fontSize: 16, fontWeight: '600', marginTop: 2 },
});
