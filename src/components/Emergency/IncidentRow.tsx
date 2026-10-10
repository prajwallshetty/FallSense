import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Incident } from '../../emergency/incidentMachine';
import { INCIDENT_STATE, locationSummary, sourceLabel } from '../../emergency/labels';
import { colors, spacing, type } from '../../theme';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/StatusBadge';
import { SimulatedBadge } from '../ui/Feedback';

export const IncidentRow: React.FC<{ incident: Incident; showName?: boolean; children?: React.ReactNode }> = ({ incident, showName, children }) => {
  const st = INCIDENT_STATE[incident.state];
  const unsynced = !incident.simulated && incident.version > incident.syncedVersion;
  return (
    <Card tone={incident.simulated ? 'simulated' : incident.state === 'escalated' ? 'danger' : 'default'}>
      {incident.simulated ? <SimulatedBadge /> : null}
      <View style={[styles.head, incident.simulated ? { marginTop: spacing.sm } : null]}>
        <Text style={[type.bodyStrong, { flex: 1 }]}>{showName ? `${incident.elderlyName}: ` : ''}{sourceLabel(incident)}</Text>
      </View>
      <Text style={styles.meta}>{new Date(incident.createdAt).toLocaleString()}</Text>
      <StatusBadge label={st.label} tone={st.tone} style={{ marginTop: spacing.sm }} />
      <Text style={styles.meta}>{locationSummary(incident.location)}</Text>
      {incident.acknowledgedBy ? <Text style={styles.meta}>Acknowledged by {incident.acknowledgedBy.name}</Text> : null}
      {incident.resolution ? <Text style={styles.meta}>Outcome: {incident.resolution.replace('_', ' ')}</Text> : null}
      {incident.cancelledBy ? <Text style={styles.meta}>Cancelled {incident.cancelledBy.startsWith('watch') || incident.cancelledBy.startsWith('wearer') ? 'on the watch' : 'in the app'}</Text> : null}
      {unsynced ? <Text style={[styles.meta, { color: colors.warning, fontWeight: '700' }]}>Not yet uploaded. Will retry.</Text> : null}
      {children}
    </Card>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  meta: { fontSize: 15, color: colors.textSubtle, marginTop: 6 },
});
