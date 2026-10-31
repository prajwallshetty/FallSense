import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { HistoryItem } from '../../emergency/history';
import { colors, spacing, type } from '../../theme';
import { DETECTION_LABEL, QUALITY_LABEL, RESPONSE_LABEL } from '../../watch/labels';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/StatusBadge';

export const HistoryRow: React.FC<{ item: HistoryItem; showName?: boolean; children?: React.ReactNode }> = ({ item, showName, children }) => {
  const router = useRouter();
  const status = DETECTION_LABEL[item.status];
  const title = item.eventType === 'manual_sos' ? 'SOS' : 'Fall event';
  const openDetails = () => router.push({ pathname: '/(app)/incident/[id]', params: { id: item.id } });
  // A card with its own action buttons must not itself be a button: nested buttons are invalid on
  // web and confusing for screen readers. Those cards get an explicit Details button instead.
  const hasActions = React.Children.count(children) > 0;
  return (
    <Card
      tone={item.status === 'CONFIRMED_FALL' || item.status === 'USER_NEEDS_ASSISTANCE' ? 'danger' : 'default'}
      onPress={hasActions ? undefined : openDetails}
      accessibilityLabel={hasActions ? undefined : `${title}, ${status.label}, ${new Date(item.eventAt).toLocaleString()}. Open details.`}
    >
      <Text style={type.bodyStrong}>{showName ? `${item.userName}: ` : ''}{title}</Text>
      <Text style={styles.meta}>{new Date(item.eventAt).toLocaleString()}</Text>
      <StatusBadge label={status.label} tone={status.tone} style={{ marginTop: spacing.sm }} />
      {item.quality ? <Text style={styles.meta}>Sensor quality: {QUALITY_LABEL[item.quality].label}</Text> : null}
      {item.finalResponse ? <Text style={styles.meta}>Response: {RESPONSE_LABEL[item.finalResponse]}</Text> : null}
      <Text style={styles.meta}>{item.acknowledgedAt ? `Acknowledged by ${item.acknowledgedBy ?? 'a caretaker'}` : 'Not acknowledged'}</Text>
      {!item.uploaded ? <Text style={[styles.meta, { color: colors.warning, fontWeight: '600' }]}>Not yet uploaded. Will retry.</Text> : null}
      {hasActions ? <Button title="Details" variant="outline" size="sm" onPress={openDetails} style={{ marginTop: spacing.md }} /> : null}
      {children}
    </Card>
  );
};

const styles = StyleSheet.create({
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: 6 },
});
