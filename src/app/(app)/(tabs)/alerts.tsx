import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { BellOff } from 'lucide-react-native';
import { fromCloud } from '../../../emergency/history';
import { allIncidents, needsAttention, useCaretakerStore } from '../../../store/caretakerStore';
import { useAuthStore } from '../../../store/authStore';
import { Screen } from '../../../components/ui/Screen';
import { Button } from '../../../components/ui/Button';
import { EmptyState, ErrorBanner } from '../../../components/ui/Feedback';
import { HistoryRow } from '../../../components/Emergency/HistoryRow';
import { colors, spacing, type } from '../../../theme';

export default function AlertsScreen() {
  const isDemo = useAuthStore((s) => s.isDemo);
  const { overview, error, refresh, acknowledge, pushProblem } = useCaretakerStore();
  const [busy, setBusy] = useState<string | null>(null);
  const open = allIncidents(overview).filter(needsAttention);

  const ack = async (id: string) => {
    setBusy(id);
    try {
      await acknowledge(id);
    } catch (e) {
      Alert.alert('Could not acknowledge', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Alerts" subtitle="Falls waiting for someone to respond." inTabs refreshing={false} onRefresh={refresh}>
      {pushProblem ? <ErrorBanner message={`Alerts may not reach this phone. ${pushProblem}`} /> : null}
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {isDemo ? <Text style={type.body}>Demo accounts have no cloud alerts.</Text> : null}
      {!isDemo && open.length === 0 ? (
        <EmptyState icon={<BellOff size={44} color={colors.textSubtle} />} title="No open alerts" body="Fall alerts appear here and on your lock screen." />
      ) : null}
      {open.map((i) => (
        <HistoryRow key={i.id} item={fromCloud(i)} showName>
          <Button title="Acknowledge" isLoading={busy === i.id} onPress={() => ack(i.id)} style={{ marginTop: spacing.md }} />
        </HistoryRow>
      ))}
    </Screen>
  );
}
