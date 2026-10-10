import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Share, Text } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useCaregiverStore } from '../../../store/caregiverStore';
import { locationService, LocationPermission, mapsUrl } from '../../../services/locationService';
import { LocationSnapshot } from '../../../emergency/incidentMachine';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { EmptyState, LoadingState } from '../../../components/ui/Feedback';
import { LiveMap } from '../../../components/Map/LiveMap';
import { ElderPicker } from '../../../components/Caregiver/ElderPicker';
import { colors, spacing, type } from '../../../theme';

function OwnLocation() {
  const profile = useAuthStore((s) => s.profile);
  const [perm, setPerm] = useState<LocationPermission | null>(null);
  const [loc, setLoc] = useState<LocationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const p = await locationService.getPermission();
    setPerm(p);
    if (p === 'granted') setLoc(await locationService.getCurrentFix());
    setBusy(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => setBusy(false));
  }, [refresh]);

  return (
    <Screen title="Location" subtitle="Your location is only shared when an alert is sent, or when you share it yourself." refreshing={busy} onRefresh={refresh} inTabs>
      {perm && perm !== 'granted' ? (
        <Card tone="warning">
          <Text style={type.heading}>Location is off for SafeFall</Text>
          <Text style={[type.body, { marginVertical: spacing.md }]}>Without it, alerts cannot tell your caregivers where you are.</Text>
          {perm === 'blocked' ? (
            <Button title="Open phone settings" onPress={() => Linking.openSettings()} />
          ) : (
            <Button title="Allow location" onPress={async () => { await locationService.requestPermission(); refresh(); }} />
          )}
        </Card>
      ) : null}
      {busy && !loc ? <LoadingState label="Finding your location…" /> : null}
      {loc ? <LiveMap location={loc} title="Your current location" /> : null}
      {loc?.status === 'ok' ? (
        <Button
          title="Share my location"
          variant="outline"
          onPress={() =>
            Share.share({ message: `${profile?.fullName ?? 'I'} shared a location via SafeFall AI: ${mapsUrl(loc.latitude, loc.longitude)}` }).catch(() => undefined)
          }
        />
      ) : null}
      {loc ? <Button title="Refresh" variant="ghost" onPress={refresh} isLoading={busy} style={{ marginTop: spacing.sm }} /> : null}
    </Screen>
  );
}

function CaregiverLocation() {
  const { activeElderlyId, relations } = useAuthStore();
  const alerts = useCaregiverStore((s) => (activeElderlyId ? s.alertsByElder[activeElderlyId] ?? [] : []));
  const name = relations.find((r) => r.elderlyId === activeElderlyId)?.elderlyName ?? '';
  const withLocation = alerts.find((a) => a.location.status === 'ok');
  return (
    <Screen title="Location" subtitle={`${name}'s location is shared only as part of an alert.`} inTabs>
      <ElderPicker />
      {withLocation ? (
        <>
          <Text style={[type.body, { marginBottom: spacing.md }]}>From the alert on {new Date(withLocation.createdAt).toLocaleString()}:</Text>
          <LiveMap location={withLocation.location} title="Last alert location" />
        </>
      ) : (
        <EmptyState icon={<MapPin size={44} color={colors.textSubtle} />} title="No location available" body="When an alert includes a location, it will appear here." />
      )}
    </Screen>
  );
}

export default function LocationScreen() {
  const isCaregiver = useAuthStore((s) => s.profile?.role === 'caregiver');
  return isCaregiver ? <CaregiverLocation /> : <OwnLocation />;
}
