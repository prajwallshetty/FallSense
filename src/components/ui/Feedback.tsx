import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { colors, spacing, type } from '../../theme';
import { Button } from './Button';

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <View style={styles.center} accessibilityLiveRegion="polite">
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={[type.body, { marginTop: spacing.md }]}>{label}</Text>
  </View>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }> = ({ icon, title, body, action }) => (
  <View style={styles.empty}>
    {icon}
    <Text style={[type.heading, styles.emptyTitle]}>{title}</Text>
    {body ? <Text style={[type.body, styles.centerText]}>{body}</Text> : null}
    {action ? <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>{action}</View> : null}
  </View>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <View style={styles.error} accessibilityRole="alert">
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <AlertTriangle size={20} color={colors.danger} />
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{message}</Text>
    </View>
    {onRetry ? <Button title="Try again" onPress={onRetry} variant="outline" size="sm" style={{ marginTop: spacing.md }} /> : null}
  </View>
);

export const SimulatedBadge: React.FC = () => (
  <View style={styles.sim} accessible accessibilityLabel="Simulated device, not a real watch">
    <Text style={styles.simText}>SIMULATED, NOT A REAL WATCH</Text>
  </View>
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { marginTop: spacing.md, marginBottom: spacing.sm, textAlign: 'center' },
  centerText: { textAlign: 'center' },
  error: { backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderWidth: 1, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.lg },
  sim: { backgroundColor: colors.simulatedSoft, borderColor: colors.simulated, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  simText: { color: colors.simulated, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
});
