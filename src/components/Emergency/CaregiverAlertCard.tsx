import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import type { Incident } from '../../emergency/incidentMachine';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { callNumber } from '../../services/contactActions';
import { IncidentRow } from './IncidentRow';
import { LiveMap } from '../Map/LiveMap';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/Feedback';
import { colors, spacing } from '../../theme';

/** An open alert as seen by a caregiver, with acknowledge / call / resolve actions. */
export const CaregiverAlertCard: React.FC<{ incident: Incident; elderPhone?: string | null }> = ({ incident, elderPhone }) => {
  const profile = useAuthStore((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeFirebaseError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return null;
  const mine = incident.acknowledgedBy?.uid === profile.userId;

  return (
    <View>
      <IncidentRow incident={incident} showName>
        {error ? <View style={{ marginTop: spacing.md }}><ErrorBanner message={error} /></View> : null}
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {incident.state === 'escalated' ? (
            <Button
              title="I'm on it (acknowledge)"
              size="lg"
              isLoading={busy}
              onPress={() => run(() => firebaseService.acknowledgeAlert(incident.id, { uid: profile.userId, name: profile.fullName }))}
              accessibilityHint="Tells the wearer and other caregivers that you are responding"
            />
          ) : null}
          {elderPhone ? (
            <Button
              title={`Call ${incident.elderlyName}`}
              variant="secondary"
              icon={<Phone size={22} color={colors.text} />}
              onPress={() => callNumber(elderPhone)}
            />
          ) : null}
          {incident.state === 'escalated' || incident.state === 'acknowledged' ? (
            <Button
              title="Mark as resolved"
              variant="outline"
              isLoading={busy && mine}
              onPress={() =>
                Alert.alert('Resolve this alert?', 'Choose what happened.', [
                  { text: 'Go back', style: 'cancel' },
                  { text: 'False alarm', onPress: () => run(() => firebaseService.resolveAlert(incident.id, profile.userId, 'false_alarm')) },
                  { text: 'Helped / assisted', onPress: () => run(() => firebaseService.resolveAlert(incident.id, profile.userId, 'assisted')) },
                ])
              }
            />
          ) : null}
        </View>
        {incident.state === 'escalated' ? (
          <Text style={{ color: colors.textSubtle, fontSize: 14, marginTop: spacing.md }}>
            If you cannot reach them, call local emergency services.
          </Text>
        ) : null}
      </IncidentRow>
      <LiveMap location={incident.location} title={`Where ${incident.elderlyName.split(' ')[0]} was`} />
    </View>
  );
};
