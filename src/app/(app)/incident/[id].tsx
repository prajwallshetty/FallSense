import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useCaretakerStore } from '../../../store/caretakerStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { apiClient } from '../../../services/apiClient';
import { CloudIncident, CloudNotification } from '../../../emergency/cloudMapping';
import { fromCloud, fromLocal, HistoryItem } from '../../../emergency/history';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ErrorBanner, LoadingState } from '../../../components/ui/Feedback';
import { colors, spacing, type } from '../../../theme';
import { DETECTION_LABEL, MOVEMENT_LABEL, QUALITY_LABEL, RESPONSE_LABEL } from '../../../watch/labels';
import type { Movement } from '../../../detection/movementClassifier';
import type { Tone } from '../../../components/ui/StatusBadge';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.body, { color: colors.text }]} selectable>{value}</Text>
    </View>
  );
}

const DELIVERY: Record<CloudNotification['delivery_status'], { label: string; tone: Tone }> = {
  queued: { label: 'Sending', tone: 'info' },
  // The provider accepting a message does not prove the phone received it.
  provider_accepted: { label: 'Sent, delivery not confirmed', tone: 'info' },
  device_received: { label: 'Received on their phone', tone: 'success' },
  failed: { label: 'Failed to send', tone: 'danger' },
  no_device: { label: 'No phone registered', tone: 'warning' },
};

export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isCaregiver = useAuthStore((s) => s.profile?.role === 'caregiver');
  const usesCloud = useAuthStore((s) => s.authSource === 'cloud');
  const acknowledge = useCaretakerStore((s) => s.acknowledge);
  const local = useIncidentStore((s) => (s.active?.id === id ? s.active : s.history.find((h) => h.id === id)));
  const [cloud, setCloud] = useState<CloudIncident | null>(null);
  const [loading, setLoading] = useState(!local);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Incidents not uploaded yet have a local id, which the server does not know.
    if (!usesCloud || !/^[0-9a-f-]{36}$/.test(id)) {
      setLoading(false);
      return;
    }
    try {
      setCloud(await apiClient.request<CloudIncident>(`/v1/incidents/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, usesCloud]);

  useEffect(() => {
    load();
  }, [load]);

  const item: HistoryItem | null = cloud ? fromCloud(cloud) : local ? fromLocal(local) : null;

  if (loading) return <LoadingState />;
  if (!item) {
    return (
      <Screen title="Incident" back>
        <ErrorBanner message={error ?? 'This incident could not be found.'} />
      </Screen>
    );
  }

  const status = DETECTION_LABEL[item.status];
  const ack = async () => {
    setBusy(true);
    try {
      await acknowledge(item.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Incident" back>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      <Card>
        <StatusBadge label={status.label} tone={status.tone} />
        <Field label="Incident ID" value={item.id} />
        <Field label="User" value={item.userName} />
        <Field label="Event time" value={new Date(item.eventAt).toLocaleString()} />
        <Field label="Event classification" value={item.eventType === 'manual_sos' ? 'SOS' : `Fall event${item.movement ? ` (${MOVEMENT_LABEL[item.movement as Movement] ?? item.movement})` : ''}`} />
        <Field label="Detection state" value={status.label} />
        <Field label="Sensor quality" value={item.quality ? QUALITY_LABEL[item.quality].label : 'Not applicable'} />
        <Field label="Detection score" value={item.score !== null ? `${item.score.toFixed(2)} (heuristic, not a probability)` : 'Not applicable'} />
        <Field label="Caretaker acknowledgment" value={item.acknowledgedAt ? `${item.acknowledgedBy ?? 'A caretaker'}, ${new Date(item.acknowledgedAt).toLocaleString()}` : 'Not acknowledged'} />
        <Field label="Final user response" value={item.finalResponse ? RESPONSE_LABEL[item.finalResponse] : 'None recorded'} />
      </Card>

      {cloud?.notifications?.length ? (
        <Card>
          <Text style={type.heading}>Notifications</Text>
          {cloud.notifications.map((n) => (
            <View key={n.id} style={{ marginTop: spacing.md }}>
              <Text style={type.bodyStrong}>{n.recipient_name}</Text>
              <StatusBadge label={DELIVERY[n.delivery_status].label} tone={DELIVERY[n.delivery_status].tone} style={{ marginTop: spacing.xs }} />
            </View>
          ))}
        </Card>
      ) : null}

      {isCaregiver && item.isCloud && !item.acknowledgedAt ? <Button title="Acknowledge" size="lg" isLoading={busy} onPress={ack} /> : null}
    </Screen>
  );
}
