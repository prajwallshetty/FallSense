import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { EmergencyContact } from '../../types';
import { formatPhone } from '../../utils/validation';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { ContactForm } from '../../components/Forms/ContactForm';
import { RedeemCodePanel } from '../../components/Linking/LinkingPanels';
import { spacing, type } from '../../theme';

export default function ContactSetupScreen() {
  const { profile, relations } = useAuthStore();
  const isCaregiver = profile?.role === 'caregiver';
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!profile || isCaregiver) return;
    return firebaseService.subscribeContacts(profile.userId, setContacts, (e) => setError(describeFirebaseError(e)));
  }, [profile, isCaregiver]);

  const finish = async () => {
    if (!profile) return;
    setFinishing(true);
    try {
      await firebaseService.updateProfile(profile.userId, { onboardingComplete: true });
      // Root layout navigates to the app when the profile updates.
    } catch (e) {
      setError(describeFirebaseError(e));
    } finally {
      setFinishing(false);
    }
  };

  const confirmSkip = () =>
    Alert.alert(
      isCaregiver ? 'Skip linking?' : 'Skip emergency contacts?',
      isCaregiver
        ? 'You will not receive any alerts until you link to someone. You can do this later in Settings.'
        : 'Without emergency contacts, the alert screen cannot offer one-tap calls and texts. Linked caregivers will still be alerted.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Skip for now', onPress: finish },
      ],
    );

  if (isCaregiver) {
    return (
      <Screen title="Link an account" subtitle="Step 3 of 3" back>
        {error ? <ErrorBanner message={error} /> : null}
        <RedeemCodePanel />
        {relations.length > 0 ? (
          <Card tone="accent">
            <Text style={type.bodyStrong}>Linked to: {relations.map((r) => r.elderlyName).join(', ')}</Text>
          </Card>
        ) : null}
        <Button title={relations.length ? 'Finish setup' : 'Skip for now'} size="lg" onPress={relations.length ? finish : confirmSkip} isLoading={finishing} />
      </Screen>
    );
  }

  return (
    <Screen title="Emergency contacts" subtitle="Step 3 of 3: people you can call or text from the alert screen." back>
      {error ? <ErrorBanner message={error} /> : null}
      {contacts.map((c, i) => (
        <Card key={c.contactId} tone="accent">
          <Text style={type.bodyStrong}>
            {i + 1}. {c.name}
            {c.relationship ? ` (${c.relationship})` : ''}
          </Text>
          <Text style={type.body}>{formatPhone(c.phone)}</Text>
        </Card>
      ))}
      <Card>
        <Text style={[type.heading, { marginBottom: spacing.lg }]}>{contacts.length ? 'Add another contact' : 'Add your first contact'}</Text>
        <ContactForm
          submitLabel="Save contact"
          onSubmit={async (c) => {
            if (!profile) return;
            try {
              setError(null);
              await firebaseService.addContact(profile.userId, { ...c, priority: contacts.length + 1 });
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
        />
      </Card>
      <Button title={contacts.length ? 'Finish setup' : 'Skip for now'} size="lg" variant={contacts.length ? 'primary' : 'outline'} onPress={contacts.length ? finish : confirmSkip} isLoading={finishing} />
    </Screen>
  );
}
