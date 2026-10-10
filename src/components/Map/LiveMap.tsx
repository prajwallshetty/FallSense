import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MapPin, AlertTriangle } from 'lucide-react-native';
import type { LocationSnapshot } from '../../emergency/incidentMachine';
import { locationSummary, timeAgo } from '../../emergency/labels';
import { mapsUrl } from '../../services/locationService';
import { colors, spacing, type } from '../../theme';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface LiveMapProps {
  location: LocationSnapshot;
  title?: string;
}

/**
 * Shows a captured location honestly: coordinates, accuracy and age, or the reason it is
 * unavailable. "Open in Maps" hands off to the phone's maps app (no API key required).
 */
export const LiveMap: React.FC<LiveMapProps> = ({ location, title = 'Location' }) => {
  const ok = location.status === 'ok';
  return (
    <Card tone={ok && !location.stale ? 'default' : 'warning'}>
      <View style={styles.row}>
        {ok ? <MapPin size={26} color={colors.primary} /> : <AlertTriangle size={26} color={colors.warning} />}
        <Text style={[type.heading, { flex: 1 }]}>{title}</Text>
      </View>
      <Text style={[type.bodyStrong, { marginTop: spacing.md }]}>{locationSummary(location)}</Text>
      {ok ? (
        <>
          <Text style={styles.meta}>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            {location.accuracyM != null ? `  ·  ±${Math.round(location.accuracyM)} m` : ''}
          </Text>
          <Text style={[styles.meta, location.stale ? { color: colors.warning, fontWeight: '700' } : null]}>
            {location.stale ? 'Old position from ' : 'Captured '}
            {timeAgo(location.capturedAt)}
          </Text>
          <Button
            title="Open in Maps"
            variant="outline"
            onPress={() => Linking.openURL(mapsUrl(location.latitude, location.longitude)).catch(() => undefined)}
            style={{ marginTop: spacing.lg }}
          />
        </>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: 6 },
});
