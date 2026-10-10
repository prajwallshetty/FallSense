import React, { useState } from 'react';
import { View } from 'react-native';
import { EmergencyContact } from '../../types';
import { normalizePhone, validateName } from '../../utils/validation';
import { env } from '../../config/env';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { spacing } from '../../theme';

export type ContactDraft = Omit<EmergencyContact, 'contactId' | 'priority'>;

interface Props {
  initial?: Partial<ContactDraft>;
  submitLabel: string;
  onSubmit: (c: ContactDraft) => Promise<void>;
  onCancel?: () => void;
}

export const ContactForm: React.FC<Props> = ({ initial, submitLabel, onSubmit, onCancel }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [relationship, setRelationship] = useState(initial?.relationship ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = validateName(name, 'Name');
    const p = normalizePhone(phone, env.defaultCountryCode);
    const r = relationship.trim().length <= 40 ? { ok: true as const, value: relationship.trim() } : { ok: false as const, error: 'Keep this under 40 characters.' };
    setErrors({ name: n.ok ? undefined : n.error, phone: p.ok ? undefined : p.error, relationship: r.ok ? undefined : r.error });
    if (!n.ok || !p.ok || !r.ok) return;
    setBusy(true);
    try {
      await onSubmit({ name: n.value, phone: p.value, relationship: r.value });
      if (!initial) {
        setName('');
        setPhone('');
        setRelationship('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Input label="Name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
      <Input
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        hint={env.defaultCountryCode ? `+${env.defaultCountryCode} is added if you leave out the country code.` : 'Include the country code, e.g. +91.'}
        error={errors.phone}
      />
      <Input label="Relationship (optional)" value={relationship} onChangeText={setRelationship} placeholder="Daughter, neighbour, doctor…" error={errors.relationship} />
      <Button title={submitLabel} onPress={submit} isLoading={busy} />
      {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
};
