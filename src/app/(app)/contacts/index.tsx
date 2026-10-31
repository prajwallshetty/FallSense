import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ArrowUp, ArrowDown, Phone, MessageSquare, Pencil, Trash2 } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useEmergencyContacts } from '../../../hooks/useEmergencyContacts';
import { contactsRepo } from '../../../services/contactsRepo';
import { describeFirebaseError } from '../../../services/firebaseApp';
import { callNumber, textContacts } from '../../../services/contactActions';
import { formatPhone } from '../../../utils/validation';
import { EmergencyContact } from '../../../types';
import { Screen } from '../../../components/ui/Screen';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { EmptyState, ErrorBanner, LoadingState } from '../../../components/ui/Feedback';
import { ContactForm } from '../../../components/Forms/ContactForm';
import { colors, spacing, type } from '../../../theme';

const MAX_CONTACTS = 10;

export default function ContactsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const uid = profile?.userId;
  const { contacts, loading, error, fromCache } = useEmergencyContacts(uid);
  const [editing, setEditing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(describeFirebaseError(e));
    }
  };

  const move = (index: number, delta: number) => {
    if (!uid) return;
    const ids = contacts.map((c) => c.contactId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => contactsRepo.reorder(uid, ids));
  };

  const remove = (c: EmergencyContact) =>
    Alert.alert(`Remove ${c.name}?`, 'They will no longer appear on your alert screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            if (!uid) return;
            await contactsRepo.remove(uid, c.contactId);
            const remaining = contacts.filter((x) => x.contactId !== c.contactId).map((x) => x.contactId);
            if (remaining.length) await contactsRepo.reorder(uid, remaining);
          }),
      },
    ]);

  return (
    <Screen title="Emergency contacts" subtitle="Shown in this order on your alert screen. The first person gets the big call button." back>
      {error && !fromCache ? <ErrorBanner message={error} /> : null}
      {fromCache ? <Text style={[type.caption, { marginBottom: spacing.md }]}>Showing saved copy. Changes need an internet connection.</Text> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading ? <LoadingState label="Loading contacts…" /> : null}
      {!loading && contacts.length === 0 ? <EmptyState title="No emergency contacts" body="Add at least one person you would want to call after a fall." /> : null}

      {contacts.map((c, i) =>
        editing === c.contactId ? (
          <Card key={c.contactId} tone="accent">
            <ContactForm
              initial={c}
              submitLabel="Save changes"
              onCancel={() => setEditing(null)}
              onSubmit={(draft) =>
                run(async () => {
                  if (!uid) return;
                  await contactsRepo.update(uid, c.contactId, { ...draft, priority: c.priority });
                  setEditing(null);
                })
              }
            />
          </Card>
        ) : (
          <Card key={c.contactId}>
            <Text style={type.heading}>
              {i + 1}. {c.name}
            </Text>
            {c.relationship ? <Text style={{ fontSize: 16, color: colors.textSubtle }}>{c.relationship}</Text> : null}
            <Text style={[type.body, { marginTop: 4 }]}>{formatPhone(c.phone)}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Call" size="sm" variant="secondary" icon={<Phone size={18} color={colors.text} />} onPress={() => callNumber(c.phone)} style={{ flex: 1 }} />
              <Button title="Text" size="sm" variant="secondary" icon={<MessageSquare size={18} color={colors.text} />} onPress={() => textContacts([c.phone], '')} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button title="Up" size="sm" variant="outline" disabled={i === 0} icon={<ArrowUp size={18} color={colors.text} />} onPress={() => move(i, -1)} style={{ flex: 1 }} accessibilityHint={`Move ${c.name} up the list`} />
              <Button title="Down" size="sm" variant="outline" disabled={i === contacts.length - 1} icon={<ArrowDown size={18} color={colors.text} />} onPress={() => move(i, 1)} style={{ flex: 1 }} accessibilityHint={`Move ${c.name} down the list`} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button title="Edit" size="sm" variant="ghost" icon={<Pencil size={18} color={colors.primary} />} onPress={() => setEditing(c.contactId)} style={{ flex: 1 }} />
              <Button title="Remove" size="sm" variant="ghost" icon={<Trash2 size={18} color={colors.primary} />} onPress={() => remove(c)} style={{ flex: 1 }} />
            </View>
          </Card>
        ),
      )}

      {contacts.length < MAX_CONTACTS && !fromCache ? (
        <Card>
          <Text style={[type.heading, { marginBottom: spacing.lg }]}>Add a contact</Text>
          <ContactForm
            submitLabel="Add contact"
            onSubmit={(draft) => run(async () => { if (uid) await contactsRepo.add(uid, { ...draft, priority: contacts.length + 1 }); })}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
