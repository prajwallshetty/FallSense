import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { History as HistoryIcon } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useIncidentStore } from '../../../store/incidentStore';
import { apiClient } from '../../../services/apiClient';
import { CloudIncident } from '../../../emergency/cloudMapping';
import { fromCloud, fromLocal, HISTORY_FILTERS, HistoryFilter, HistoryItem, matchesFilter, mergeHistory } from '../../../emergency/history';
import { Screen } from '../../../components/ui/Screen';
import { Chips } from '../../../components/ui/Segmented';
import { EmptyState, ErrorBanner } from '../../../components/ui/Feedback';
import { HistoryRow } from '../../../components/Emergency/HistoryRow';
import { colors, spacing, type } from '../../../theme';

export default function HistoryScreen() {
  const { profile, authSource } = useAuthStore();
  const isCaregiver = profile?.role === 'caregiver';
  const usesCloud = authSource === 'cloud';
  const active = useIncidentStore((s) => s.active);
  const localHistory = useIncidentStore((s) => s.history);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [cloud, setCloud] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!usesCloud) return;
    try {
      const { incidents } = await apiClient.request<{ incidents: CloudIncident[] }>('/v1/incidents?limit=100');
      setCloud(incidents.map(fromCloud));
      setError(null);
    } catch (e) {
      setError(`Could not load the cloud history. ${(e as Error).message}`);
    }
  }, [usesCloud]);

  useEffect(() => {
    load();
  }, [load, localHistory]);

  const items = useMemo(() => {
    const local = isCaregiver ? [] : [...(active ? [active] : []), ...localHistory].filter((i) => !i.simulated).map(fromLocal);
    return mergeHistory(cloud, local).filter((i) => matchesFilter(i, filter));
  }, [cloud, active, localHistory, filter, isCaregiver]);

  return (
    <Screen title="History" subtitle={isCaregiver ? 'Incidents for the people you care for.' : 'Your alerts, kept even when you said you were OK.'} inTabs refreshing={false} onRefresh={load}>
      <Chips value={filter} options={HISTORY_FILTERS} onChange={setFilter} accessibilityLabel="Filter incidents" />
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {!usesCloud && authSource === 'demo' ? <Text style={[type.caption, { marginBottom: spacing.md }]}>Demo mode: history is stored on this phone only.</Text> : null}
      {items.length ? (
        items.map((i) => <HistoryRow key={i.clientEventId} item={i} showName={isCaregiver} />)
      ) : (
        <EmptyState icon={<HistoryIcon size={44} color={colors.textSubtle} />} title="Nothing to show" body={filter === 'all' ? 'Fall events and SOS alerts will appear here.' : 'No incidents match this filter.'} />
      )}
    </Screen>
  );
}
