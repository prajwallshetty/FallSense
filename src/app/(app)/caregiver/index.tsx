import React from 'react';
import { Alert, Text, View } from 'react-native';
import { UserMinus } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { describeFirebaseError } from '../../../services/firebaseApp';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { RedeemCodePanel, ShareCodePanel } from '../../../components/Linking/LinkingPanels';
import { colors, spacing, type } from '../../../theme';

export default function CaregiverLinksScreen() {
  const { profile, relations, activeElderlyId, setActiveElderly, authSource } = useAuthStore();
  if (!profile) return null;
  const isElderly = profile.role === 'elderly';
  // Access-code accounts are linked by the backend administrator, not from the phone.
  const canManageLinks = authSource === 'firebase';

  const remove = (relationId: string, name: string) =>
    Alert.alert(
      isElderly ? `Remove ${name}?` : `Stop caring for ${name}?`,
      isElderly ? `${name} will no longer receive your alerts or see your data.` : `You will no longer receive ${name}'s alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => firebaseService.removeRelation(relationId).catch((e) => Alert.alert('Could not remove', describeFirebaseError(e))),
        },
      ],
    );

  return (
    <Screen title={isElderly ? 'Caregivers' : 'People I care for'} subtitle={isElderly ? 'People who receive your alerts.' : 'Whose alerts you receive.'} back>
      {relations.length === 0 ? (
        <Card>
          <Text style={type.body}>{isElderly ? 'No caregivers yet. Create a code below and give it to someone you trust.' : 'You are not linked to anyone yet.'}</Text>
        </Card>
      ) : (
        relations.map((r) => {
          const name = isElderly ? r.caregiverName : r.elderlyName;
          const selected = !isElderly && r.elderlyId === activeElderlyId;
          return (
            <Card key={r.relationId} tone={selected ? 'accent' : 'default'}>
              <Text style={type.heading}>{name}</Text>
              {r.createdAt ? <Text style={{ fontSize: 15, color: colors.textSubtle, marginTop: 4 }}>Linked {new Date(r.createdAt).toLocaleDateString()}</Text> : null}
              {selected ? <StatusBadge label="Shown on Home" tone="info" style={{ marginTop: spacing.sm }} /> : null}
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {!isElderly && !selected ? <Button title="Show on Home" variant="secondary" onPress={() => setActiveElderly(r.elderlyId)} /> : null}
                {canManageLinks ? <Button title="Remove link" variant="outline" icon={<UserMinus size={20} color={colors.text} />} onPress={() => remove(r.relationId, name)} /> : null}
              </View>
            </Card>
          );
        })
      )}
      {canManageLinks ? isElderly ? <ShareCodePanel /> : <RedeemCodePanel /> : <Text style={type.body}>Links are set up by your SafeFall administrator.</Text>}
    </Screen>
  );
}
