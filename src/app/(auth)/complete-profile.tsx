import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { firebaseService } from '../../services/firebase';
import { describeFirebaseError } from '../../services/firebaseApp';
import { signOutEverywhere } from '../../services/session';
import { normalizePhone, validateName } from '../../utils/validation';
import { env } from '../../config/env';
import { UserRole } from '../../types';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { RolePicker } from '../../components/Forms/RolePicker';
import { spacing } from '../../theme';

/** Shown when a user is signed in but their profile document does not exist yet. */
export default function CompleteProfileScreen() {
  const { uid, email } = useAuthStore();
  const [role, setRole] = useState<UserRole>('elderly');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = validateName(fullName, 'Full name');
    const p = normalizePhone(phone, env.defaultCountryCode);
    setErrors({ fullName: n.ok ? undefined : n.error, phone: p.ok ? undefined : p.error });
    if (!n.ok || !p.ok || !uid) return;
    setBusy(true);
    setFormError(null);
    try {
      await firebaseService.createProfile({ uid, email: (email ?? '').toLowerCase(), role, fullName: n.value, phone: p.value });
    } catch (err) {
      setFormError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Finish your profile" subtitle={email ?? undefined}>
      <RolePicker value={role} onChange={setRole} />
      {formError ? <ErrorBanner message={formError} onRetry={submit} /> : null}
      <Input label="Full name" value={fullName} onChangeText={setFullName} error={errors.fullName} />
      <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
      <Button title="Save and continue" onPress={submit} isLoading={busy} size="lg" />
      <Button title="Sign out" variant="ghost" onPress={() => signOutEverywhere().catch(() => undefined)} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}
